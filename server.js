// server.js
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

import {
  ingestFileToDB,
  getEmbedding,
  extractTextFromFile
} from "./ingest-utils.js";
import {
  listDocs,
  getAllChunks,
  insertChat,
  getChats,
  clearChats,
  listDocsWithStats,
  getDocById,
  getChunksByDoc,
  deleteChunkById,
  deleteDocCascade,
  countChunksForDoc
} from "./db.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// 确保环境
const REQUIRED_ENVS = ["BASE_URL", "AIZEX_API_KEY"];
for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.warn(`[WARN] ENV ${key} is not set. Please configure it in .env`);
  }
}

// 使用 cors 中间件，允许所有来源访问
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// 确保Upload文件夹存在
const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer 上传配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "");
    cb(null, `${uuidv4()}${ext}`); // preserve extension
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 25MB
});

// 余弦相似度函数
function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
function norm(a) {
  return Math.sqrt(dot(a, a));
}
function cosineSim(a, b) {
  const denom = norm(a) * norm(b) + 1e-8;
  return denom === 0 ? 0 : dot(a, b) / denom;
}

function clampTopK(value, fallback = 5, min = 1, max = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseEmbeddingMaybe(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// OpenAI的API包装器
async function postChatCompletion(body) {
  const baseURL = process.env.BASE_URL;
  const apiKey = process.env.AIZEX_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("Missing BASE_URL or AIZEX_API_KEY");
  }
  const { data } = await axios.post(`${baseURL}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 60_000,
  });
  return data;
}

// 图片解析
async function chatVision(imagePathOrUrl, prompt = "请解析这张图", model = "gpt-4o") {
  let imageItem;
  if (/^https?:\/\//i.test(imagePathOrUrl)) {
    imageItem = { type: "image_url", image_url: { url: imagePathOrUrl } };
  } else {
    const mime = (await import("mime-types")).default;
    const buf = await fsp.readFile(imagePathOrUrl);
    const b64 = buf.toString("base64");
    const m = mime.lookup(path.extname(imagePathOrUrl)) || "image/png";
    imageItem = { type: "image_url", image_url: { url: `data:${m};base64,${b64}` } };
  }

  const j = await postChatCompletion({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, imageItem],
      },
    ],
  });

  const content = j?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Vision API returned empty content");
  }
  return content;
}

async function recognizeImageContent(imagePath) {
  const prompt =
    "请对这张图的内容做尽可能详细的描述，保证你的描述能涵盖图片中的所有信息。仅输出该描述，不要输出其他多余内容。";
  return chatVision(imagePath, prompt, "gpt-4o");
}

// 识别文件内容（提取文本并生成描述）
async function recognizeFileContent(filePath, filename) {
  try {
    const text = await extractTextFromFile(filePath);
    if (!text || !text.trim()) {
      return `文件 ${filename} 内容为空或无法提取文本。`;
    }
    // 生成文件内容描述（类似图片识别的处理）
    // 可以限制长度，避免太长
    const preview = text.slice(0, 5000); // 取前5000字符作为预览
    return `文件 ${filename} 的内容如下：\n${preview}${text.length > 5000 ? "\n（文件内容较长，已截取前5000字符）" : ""}`;
  } catch (err) {
    console.error("File content extraction failed:", err);
    return `文件 ${filename} 内容提取失败：${err.message || String(err)}`;
  }
}

// 简单RAG搜索
async function search_rag(query, topK = 5) {
  if (!query) return [];
  const qEmb = await getEmbedding(query);
  const rows = getAllChunks() || [];
  if (rows.length === 0) return [];

  const scored = rows
    .map((r) => {
      const emb = parseEmbeddingMaybe(r.embedding);
      if (!emb) return null;
      return { ...r, score: cosineSim(qEmb, emb) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, clampTopK(topK));

  return scored.map((s) => ({
    snippet: (s.content || "").slice(0, 1200),
    source: s.filename || `文档${s.doc_id}`,
    score: s.score,
  }));
}

// Reaxys API 调用
async function search_reaxys(query) {
  const apiKey = process.env.REAXYS_API_KEY;
  const apiUrl = process.env.REAXYS_API_URL || "https://api.reaxys.com/v2/api";
  
  if (!apiKey) {
    console.warn("[WARN] REAXYS_API_KEY is not set. Reaxys search will be skipped.");
    return null;
  }

  try {
    // 根据 Reaxys API 文档调整请求格式
    // 这里是一个通用示例，需要根据实际 API 文档调整
    const response = await axios.post(
      apiUrl,
      {
        query: query,
        // 可以根据需要添加其他参数
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          // 或者使用 API Key 作为 header，根据实际文档调整
          // "X-API-Key": apiKey,
        },
        timeout: 30_000,
      }
    );

    const data = response.data;
    
    // 解析 Reaxys 返回结果，转换为与 RAG 类似的格式
    // 需要根据实际 API 返回格式调整
    if (data && (data.results || data.data || data.hits)) {
      const results = data.results || data.data || data.hits || [];
      if (Array.isArray(results) && results.length > 0) {
        return results.slice(0, 5).map((item, idx) => ({
          snippet: (item.text || item.content || item.abstract || JSON.stringify(item)).slice(0, 1200),
          source: item.source || item.title || `Reaxys结果${idx + 1}`,
          score: item.score || item.relevance || 1.0,
        }));
      }
    }
    
    return null;
  } catch (err) {
    console.error("Reaxys API error:", err?.response?.data || err?.message || err);
    return null;
  }
}

// 联网搜索 API 调用（使用 Tavily API 作为示例）
async function search_web(query) {
  const apiKey = process.env.TAVILY_API_KEY || process.env.WEB_SEARCH_API_KEY;
  
  if (!apiKey) {
    console.warn("[WARN] TAVILY_API_KEY or WEB_SEARCH_API_KEY is not set. Web search will be skipped.");
    return null;
  }

  try {
    // 使用 Tavily API（专门为 AI 设计的搜索 API）
    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: apiKey,
        query: query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );

    const data = response.data;
    
    // 解析 Tavily 返回结果
    if (data && (data.results || data.answer)) {
      const results = [];
      
      // 如果有答案，优先使用
      if (data.answer) {
        results.push({
          snippet: data.answer.slice(0, 1200),
          source: "网络搜索答案",
          score: 1.0,
        });
      }
      
      // 添加搜索结果
      if (Array.isArray(data.results) && data.results.length > 0) {
        data.results.forEach((item) => {
          if (item.content) {
            results.push({
              snippet: item.content.slice(0, 1200),
              source: item.title || item.url || "网络搜索结果",
              score: item.score || 0.8,
            });
          }
        });
      }
      
      if (results.length > 0) {
        return results.slice(0, 5);
      }
    }
    
    return null;
  } catch (err) {
    console.error("Web search API error:", err?.response?.data || err?.message || err);
    
    // 如果 Tavily 失败，可以尝试其他搜索 API（如 Serper）
    if (process.env.SERPER_API_KEY) {
      try {
        const serperResponse = await axios.post(
          "https://google.serper.dev/search",
          {
            q: query,
            num: 5,
          },
          {
            headers: {
              "X-API-KEY": process.env.SERPER_API_KEY,
              "Content-Type": "application/json",
            },
            timeout: 30_000,
          }
        );
        
        const serperData = serperResponse.data;
        if (serperData && Array.isArray(serperData.organic)) {
          return serperData.organic.slice(0, 5).map((item) => ({
            snippet: (item.snippet || item.description || "").slice(0, 1200),
            source: item.title || item.link || "网络搜索结果",
            score: item.position ? 1.0 / (item.position + 1) : 0.8,
          }));
        }
      } catch (serperErr) {
        console.error("Serper API error:", serperErr?.response?.data || serperErr?.message);
      }
    }
    
    return null;
  }
}

// 上传并导入文档
app.post("/api/ingest", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: true, message: "Missing file" });

  const fp = req.file.path;
  let originalname = req.file.originalname;

  try {
    try {
      originalname = Buffer.from(originalname, "latin1").toString("utf8");
    } catch (e) {
      console.warn("Filename encoding fix failed:", e);
    }

    const result = await ingestFileToDB(fp, originalname, {
      onProgress: ({ total, done }) => {
        console.log(`Ingesting ${originalname} : ${done}/${total}`);
      },
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Ingest error:", err);
    return res.status(500).json({ error: true, message: err.message || String(err) });
  } finally {
    try {
      await fsp.unlink(fp);
    } catch {}
  }
});

// 列出已导入文档（调试用）
app.get("/api/docs", (req, res) => {
  try {
    const docs = listDocs();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: true, message: err.message || String(err) });
  }
});

// 文档列表 + chunk 数
app.get("/api/docs/stats", (req, res) => {
  try {
    const docs = listDocsWithStats();
    res.json({ ok: true, docs });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// 文档详情（含全文）+ chunk 计数
app.get("/api/doc/:id", (req, res) => {
  try {
    const id = req.params.id;
    const doc = getDocById(id);
    if (!doc) return res.status(404).json({ ok: false, message: "Doc not found" });
    const chunk_count = countChunksForDoc(id);
    res.json({ ok: true, doc: { ...doc, chunk_count } });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// 文档 chunks 列表
app.get("/api/doc/:id/chunks", (req, res) => {
  try {
    const id = req.params.id;
    const rows = getChunksByDoc(id) || [];
    // 仅返回必要字段，避免 embedding 过大
    const chunks = rows.map(r => ({
      id: r.id,
      content: r.content,
      created_at: r.created_at
    }));
    res.json({ ok: true, chunks });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// 删除单个 chunk
app.delete("/api/chunk/:id", (req, res) => {
  try {
    const id = req.params.id;
    const changes = deleteChunkById(id);
    if (!changes) return res.status(404).json({ ok: false, message: "Chunk not found" });
    res.json({ ok: true, deleted: changes });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// 删除整个文档（及所有 chunks）
app.delete("/api/doc/:id", (req, res) => {
  try {
    const id = req.params.id;
    const { delChunks, delDoc } = deleteDocCascade(id);
    if (!delDoc) return res.status(404).json({ ok: false, message: "Doc not found" });
    res.json({ ok: true, deletedDoc: delDoc, deletedChunks: delChunks });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message || String(err) });
  }
});

// 检索接口（调试用）
app.post("/api/search", async (req, res) => {
  const { query, topK = 5 } = req.body || {};
  if (!query) return res.status(400).json({ error: true, message: "Missing query" });

  try {
    const qEmb = await getEmbedding(query);
    const rows = getAllChunks() || [];
    const scored = rows
      .map((r) => {
        const emb = parseEmbeddingMaybe(r.embedding);
        if (!emb) return null;
        return { ...r, score: cosineSim(qEmb, emb) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, clampTopK(topK));

    res.json({ query, topK: clampTopK(topK), results: scored });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: true, message: err.message || String(err) });
  }
});

// 回答问题接口（智能 Agent + 自动 RAG）
app.post("/api/solve", upload.fields([{ name: "image", maxCount: 1 }, { name: "file", maxCount: 1 }]), async (req, res) => {
  let imagePath = req.files?.image?.[0]?.path || null;
  let filePath = req.files?.file?.[0]?.path || null;
  let fileInfo = req.files?.file?.[0] || null;
  let results = [];

  // 从答案里提取被引用的编号顺序（只统计 $^{[1][2]}$ 里的数字，支持如[1-3]的范围版本）
  function extractCitationOrder(answer, maxIndex) {
    if (!answer || !maxIndex) return [];
    const order = [];
    const seen = new Set();
    const supRegex = /\$\^\{([^}]*)\}\$/g; // 捕获 $^{ ... }$
    let m;
    const add = (n) => {
      const k = Number(n);
      if (Number.isFinite(k) && k >= 1 && k <= maxIndex && !seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    };
    while ((m = supRegex.exec(answer)) !== null) {
      const inside = m[1] || "";
      // 范围 [a-b]
      const rangeRe = /\[(\d+)\s*[-–—]\s*(\d+)\]/g;
      let r;
      while ((r = rangeRe.exec(inside)) !== null) {
        const a = parseInt(r[1], 10);
        const b = parseInt(r[2], 10);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          if (a <= b) {
            for (let k = a; k <= b; k++) add(k);
          } else {
            for (let k = a; k >= b; k--) add(k);
          }
        }
      }
      // 单个 [n]
      const singleRe = /\[(\d+)\]/g;
      let s;
      while ((s = singleRe.exec(inside)) !== null) {
        add(parseInt(s[1], 10));
      }
    }
    return order;
  }

  try {
    // 基础入参与校验
    const questionRaw = req.body?.question;
    const question = typeof questionRaw === "string" ? questionRaw.trim() : "";
    const session_id = req.body?.session_id || "default";

    if (!question && !imagePath && !filePath) {
      return res
        .status(400)
        .json({ error: true, message: "Missing question, image or file" });
    }

    // 如有图片，先做识别（用于数据库记录；不直接发给模型）
    let imageDescription = "";
    if (imagePath) {
      try {
        imageDescription = await recognizeImageContent(imagePath);
      } catch (e) {
        console.warn(
          "Image recognition failed, will continue without it:",
          e?.message || e
        );
      }
    }

    // 如有文件，先提取文本内容（用于数据库记录）
    let fileDescription = "";
    if (filePath && fileInfo) {
      try {
        let originalname = fileInfo.originalname;
        try {
          originalname = Buffer.from(originalname, "latin1").toString("utf8");
        } catch (e) {
          console.warn("Filename encoding fix failed:", e);
        }
        fileDescription = await recognizeFileContent(filePath, originalname);
      } catch (e) {
        console.warn(
          "File content extraction failed, will continue without it:",
          e?.message || e
        );
      }
    }

    // 存储使用的完整问题（文本 + 识别描述）
    let fullQuestion = question || "";
    if (imageDescription) {
      fullQuestion = fullQuestion ? `${fullQuestion}\n${imageDescription}` : imageDescription;
    }
    if (fileDescription) {
      fullQuestion = fullQuestion ? `${fullQuestion}\n${fileDescription}` : fileDescription;
    }

    // 近期对话历史（用于保持上下文）
    const history =
      (getChats(session_id, 10) || []).map((h) => ({
        role: h.role,
        content: h.content,
      })) || [];

    // 基础指令
    const baseMessages = [
      {
        role: "system",
        content: `你是大学有机化学助教，需要为学生提供详细、有条理的解答。请遵循以下要求：
        1. 回答必须清晰分段，包含必要的反应方程式、机理解释、实验条件、区域/立体选择性原因、常见错误与总结。
        2. 不要输出任何图片，仅使用文字或 LaTeX 格式书写化学式和方程式。
        3. 若需要用到后面给你的检索到的相关知识，请在回答中严格使用 KaTeX 上标形式标注参考编号，例如：$^{[1][2]}$。不要写“根据检索到的相关知识”这种措辞，直接输出你的回答，并在相关内容处标注引用编号即可。`,
      },
      ...history,
    ];

    // 复用的 data URL（用于两次调用都能带上图片）
    let imageDataUrl = "";
    if (imagePath) {
      const mimeTypes = (await import("mime-types")).default;
      const buf = await fsp.readFile(imagePath);
      const b64 = buf.toString("base64");
      const m = mimeTypes.lookup(imagePath) || "image/png";
      imageDataUrl = `data:${m};base64,${b64}`;
    }

    // 提取文件完整内容（用于API调用）
    let fileContent = "";
    if (filePath) {
      try {
        fileContent = await extractTextFromFile(filePath);
      } catch (e) {
        console.warn("File content extraction for API failed:", e?.message || e);
      }
    }

    // 用户内容（支持图文和文件）
    const userContent = [];
    
    // 构建文本部分
    let textPart = question || "";
    if (fileContent) {
      textPart = textPart 
        ? `${textPart}\n\n文件内容：\n${fileContent}` 
        : `文件内容：\n${fileContent}`;
    }
    if (textPart) {
      userContent.push({ type: "text", text: textPart });
    }
    
    // 如果有图片，添加图片
    if (imageDataUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageDataUrl },
      });
    }

    // 工具定义（让模型决定是否调用 RAG）
    // 注意：Reaxys 和联网搜索不在工具列表中，它们会在 RAG 无结果时自动调用
    const tools = [
      {
        type: "function",
        function: {
          name: "search_rag",
          description:
            "Retrieve relevant knowledge about an organic chemical entity or concept from local knowledge base. Use this when you need to search for information in the local knowledge base.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Entity + property to search",
              },
            },
            required: ["query"],
          },
        },
      },
    ];

    // 第一次调用：使用支持视觉的模型 + 工具
    const first = await postChatCompletion({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [...baseMessages, { role: "user", content: userContent }],
      tools,
      tool_choice: "auto",
    });

    let answerText = "";

    // 读取模型是否发起了工具调用
    const firstMsg = first?.choices?.[0]?.message || {};
    const toolCalls =
      firstMsg?.tool_calls ||
      (firstMsg?.function_call
        ? [{ type: "function", function: firstMsg.function_call }]
        : []);

    const ragCall = (toolCalls || []).find(
      (tc) => tc?.type === "function" && tc?.function?.name === "search_rag"
    );

    // 辅助函数：解析工具调用的 query 参数
    function extractQueryFromToolCall(toolCall) {
      try {
        const args = toolCall?.function?.arguments;
        const parsed = typeof args === "string" ? JSON.parse(args) : args;
        if (parsed && typeof parsed.query === "string") {
          return parsed.query;
        }
      } catch {
        // 忽略解析错误
      }
      return null;
    }

    // 辅助函数：判断搜索结果是否与问题相关
    async function isSearchResultsRelevant(searchResults, query, sourceName) {
      if (!searchResults || searchResults.length === 0) {
        return false;
      }

      const contextText = (searchResults || [])
        .map((r, i) => `[${i + 1}] ${r?.snippet || ""}`)
        .join("\n\n");

      const relevancePrompt = `请判断以下搜索结果是否与用户问题相关。

用户问题：${query}

搜索结果（来自${sourceName}）：
${contextText}

请只回答"相关"或"不相关"，不要输出其他内容。如果搜索结果能够帮助回答用户问题，回答"相关"；如果搜索结果与问题无关或无法提供有用信息，回答"不相关"。`;

      try {
        const relevanceCheck = await postChatCompletion({
          model: "gpt-4o",
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content: "你是一个相关性判断助手，只需要回答'相关'或'不相关'。",
            },
            {
              role: "user",
              content: relevancePrompt,
            },
          ],
        });

        const response = (relevanceCheck?.choices?.[0]?.message?.content || "").trim();
        const isRelevant = response.includes("相关") && !response.includes("不相关");
        
        console.log(`${sourceName} relevance check: ${isRelevant ? "相关" : "不相关"}`);
        return isRelevant;
      } catch (err) {
        console.error(`Relevance check error for ${sourceName}:`, err?.message || err);
        // 如果判断失败，默认认为相关（保守策略）
        return true;
      }
    }

    // 辅助函数：处理搜索结果并生成答案
    async function processSearchResults(searchResults, sourceName) {
      if (!searchResults || searchResults.length === 0) {
        return null;
      }

      const contextText = (searchResults || [])
        .map((r, i) => `[${i + 1}] ${r?.snippet || ""}`)
        .join("\n\n");

      // 第二次调用也携带图片和文件
      let secondPromptText = `请结合上图（若有）和文件内容（若有）与以下知识片段作答：\n${contextText}\n\n`;
      if (question) {
        secondPromptText += `问题：${question}\n`;
      }
      if (fileContent) {
        secondPromptText += `\n文件内容：\n${fileContent}\n`;
      }
      secondPromptText += `请在需要引用的句子处使用 KaTeX 上标编号格式，如 $^{[1][2]}$，编号与上文方括号内的序号一致。`;

      const secondUserContent = [{ type: "text", text: secondPromptText }];
      if (imageDataUrl) {
        secondUserContent.push({
          type: "image_url",
          image_url: { url: imageDataUrl },
        });
      }

      const second = await postChatCompletion({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [...baseMessages, { role: "user", content: secondUserContent }],
      });

      return second?.choices?.[0]?.message?.content || "";
    }

    // 辅助函数：尝试搜索并判断相关性，如果相关则处理结果
    async function trySearchWithRelevanceCheck(searchFunc, query, sourceName, currentQuery) {
      const searchResults = await searchFunc(query);
      
      if (!searchResults || searchResults.length === 0) {
        console.log(`${sourceName} found no results`);
        return { success: false, results: null, answerText: null };
      }

      console.log(`${sourceName} found ${searchResults.length} results`);
      const isRelevant = await isSearchResultsRelevant(searchResults, currentQuery || query, sourceName);
      
      if (isRelevant) {
        console.log(`${sourceName} results are relevant, using them`);
        const answerText = await processSearchResults(searchResults, sourceName);
        return { success: true, results: searchResults, answerText };
      } else {
        console.log(`${sourceName} results are not relevant`);
        return { success: false, results: null, answerText: null };
      }
    }

    if (ragCall) {
      console.log("RAG Called");

      // 尝试从工具调用中解析 query
      let ragQuery = extractQueryFromToolCall(ragCall);
      
      // 回退策略
      if (!ragQuery) {
        ragQuery = question || imageDescription || fileDescription || "";
      }

      const currentQuery = ragQuery || question || imageDescription || fileDescription || "";

      // 执行 RAG 检索并判断相关性
      const ragResult = await trySearchWithRelevanceCheck(
        async (q) => await search_rag(q, 5),
        ragQuery,
        "RAG",
        currentQuery
      );

      if (ragResult.success) {
        // RAG 结果相关，使用它
        results = ragResult.results;
        answerText = ragResult.answerText;
      } else {
        // RAG 没搜到或不相关，尝试 Reaxys
        console.log("Trying Reaxys...");
        const reaxysResult = await trySearchWithRelevanceCheck(
          search_reaxys,
          currentQuery,
          "Reaxys",
          currentQuery
        );

        if (reaxysResult.success) {
          // Reaxys 结果相关，使用它
          results = reaxysResult.results;
          answerText = reaxysResult.answerText;
        } else {
          // Reaxys 没搜到或不相关，尝试联网搜索
          console.log("Trying web search...");
          const webResult = await trySearchWithRelevanceCheck(
            search_web,
            currentQuery,
            "Web",
            currentQuery
          );

          if (webResult.success) {
            // 联网搜索结果相关，使用它
            results = webResult.results;
            answerText = webResult.answerText;
          } else {
            // 所有搜索都没结果或不相关，再次调用模型直接回答
            console.log("All searches failed or not relevant, asking model to answer directly");
            const directAnswer = await postChatCompletion({
              model: "gpt-4o",
              temperature: 0.2,
              messages: [...baseMessages, { role: "user", content: userContent }],
            });
            answerText = directAnswer?.choices?.[0]?.message?.content || "抱歉，我无法找到相关信息来回答您的问题。";
            results = [];
          }
        }
      }
    } else {
      console.log("RAG Uncalled");
      // 未调用 RAG：直接采用第一次结果
      answerText = first?.choices?.[0]?.message?.content || "";
      results = []; // 显式置空
    }

    // 存储聊天记录（含识别描述）
    insertChat(session_id, "user", fullQuestion || "");
    insertChat(session_id, "assistant", answerText || "");

    // 仅返回“答案中实际引用过”的 sources（按首次出现顺序），并保留原编号
    let sources = [];
    if (results && results.length && answerText) {
      const usedIdxOrder = extractCitationOrder(answerText, results.length);
      if (usedIdxOrder.length) {
        sources = usedIdxOrder
          .map((idx) => {
            const s = results[idx - 1];
            if (!s) return null;
            const nameWithoutExt = String(s?.source || `文档${idx}`).replace(
              /\.[^/.]+$/,
              ""
            );
            const snippetWithTitle = `[${idx}]《${nameWithoutExt}》：${String(
              s?.snippet || ""
            ).slice(0, 80)}……`;
            return { snippetWithTitle, score: s?.score };
          })
          .filter(Boolean);
      } else {
        // 若未检测到任何引用，则不返回 sources（保持空数组）
        sources = [];
      }
    }

    return res.json({
      id: Date.now(),
      query: question || "",
      text: answerText || "",
      sources,
    });
  } catch (err) {
    console.error("Solve error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: true,
      message: err?.response?.data || err?.message || "Unknown error",
      sources: [],
    });
  } finally {
    // 清理临时文件
    if (imagePath) {
      try {
        await fsp.unlink(imagePath);
      } catch {}
    }
    if (filePath) {
      try {
        await fsp.unlink(filePath);
      } catch {}
    }
  }
});

// 清空历史记录接口
app.post("/api/clear", async (req, res) => {
  try {
    const { session_id } = req.body || {};
    const deleted = clearChats(session_id);
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message || String(err) });
  }
});

// 反馈接口
app.post("/api/feedback", async (req, res) => {
  try {
    const { message, session_id } = req.body || {};
    if (!message) return res.json({ ok: false, message: "Empty message" });

    const user = process.env.FEEDBACK_EMAIL_USER;
    const pass = process.env.FEEDBACK_EMAIL_PASS;
    if (!user || !pass) {
      return res.json({ ok: false, message: "Feedback email env not set" });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `OrganicChem AI <${user}>`,
      to: "1017944978@qq.com",
      subject: `[OrganicChem-AI 使用反馈] from ${session_id || "unknown"}`,
      text: message,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Feedback error:", err);
    res.json({ ok: false, message: err.message || String(err) });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});

// 针对未处理拒绝的安全网
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});