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
  getEmbedding
} from "./ingest-utils.js";
import {
  listDocs,
  getAllChunks,
  insertChat,
  getChats,
  clearChats,
  // 新增导入
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
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
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

// === 新增：文档库管理 REST ===

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
app.post("/api/solve", upload.single("image"), async (req, res) => {
  let imagePath = req.file ? req.file.path : null;
  try {
    const question = req.body?.question;
    const session_id = req.body?.session_id || "default";

    if (!question && !imagePath) {
      return res.status(400).json({ error: true, message: "Missing question or image" });
    }

    // 如果有图片，先做识别，用于数据库记录（不用于发给模型）
    let imageDescription = "";
    if (imagePath) {
      try {
        imageDescription = await recognizeImageContent(imagePath);
      } catch (e) {
        console.warn("Image recognition failed, will continue without it:", e?.message || e);
      }
    }

    // 检索和存储的完整问题 = 文字 + 图片描述
    const fullQuestion = imageDescription ? `${question || ""}\n${imageDescription}` : question || imageDescription;

    const history = (getChats(session_id, 10) || []).map((h) => ({
      role: h.role,
      content: h.content,
    }));

    // 基础指令
    const baseMessages = [
      {
        role: "system",
        content: `你是大学有机化学助教，需要为学生提供详细、有条理的解答。请遵循以下要求：
1. 回答必须清晰分段，包含必要的反应方程式、机理解释、实验条件、区域/立体选择性原因、常见错误与总结。
2. 不要输出任何图片，仅使用文字或 LaTeX 格式书写化学式和方程式。
3. 如果用户提供的图片中包含结构式，可以结合文字描述分析；若图片结构式过于复杂、罕见或明显为识别错误，则忽略图片结构式，仅基于文字进行回答。
4. 若需要用到后面给你的检索到的相关知识，请在回答中严格使用 KaTeX 上标形式标注参考编号，例如：$^{[1][2]}$。不要写“根据检索到的相关知识”这种措辞，直接输出你的回答，并在相关内容处标注引用编号即可。`,
      },
      ...history,
    ];

    // 用户内容（可能包含图片）
    const userContent = [{ type: "text", text: question || "" }];
    if (imagePath) {
      const mime = (await import("mime-types")).default;
      const buf = await fsp.readFile(imagePath);
      const b64 = buf.toString("base64");
      const m = mime.lookup(path.extname(imagePath)) || "image/png";
      userContent.push({ type: "image_url", image_url: { url: `data:${m};base64,${b64}` } });
    }

    // 工具定义
    const tools = [
      {
        type: "function",
        function: {
          name: "search_rag",
          description: "Retrieve relevant knowledge about a organic chemical entity or concept",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Entity + property to search" },
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

    const firstMsg = first?.choices?.[0]?.message || {};
    const toolCalls =
      firstMsg?.tool_calls ||
      (firstMsg?.function_call ? [{ type: "function", function: firstMsg.function_call }] : []);

    const ragCall = (toolCalls || []).find(
      (tc) => tc?.type === "function" && tc?.function?.name === "search_rag"
    );

    if (ragCall) {
      let ragQuery = "";
      try {
        const args = ragCall.function?.arguments;
        ragQuery = typeof args === "string" ? JSON.parse(args)?.query : args?.query;
      } catch {
        // 忽略解析错误，回退
      }
      ragQuery = ragQuery || (question || "");

      const results = await search_rag(ragQuery, 5);
      const contextText = results.map((r, i) => `[${i + 1}] ${r.snippet}`).join("\n\n");

      // 第二次调用：合成最终答案（不再传图片）
      const second = await postChatCompletion({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          ...baseMessages,
          {
            role: "user",
            content: `根据以下知识回答问题：\n${contextText}\n\n问题：${question || ""}`,
          },
        ],
      });

      answerText = second?.choices?.[0]?.message?.content || "";
    } else {
      // 未调用 RAG，就直接用第一次结果
      answerText = first?.choices?.[0]?.message?.content || "";
    }

    // 存储聊天记录（含识别描述）
    insertChat(session_id, "user", fullQuestion || "");
    insertChat(session_id, "assistant", answerText || "");

    // 构建 sources（基于最终 fullQuestion 再检索一次，贴近用户实际问题）
    const scored = await search_rag(fullQuestion || question || "", 5);
    const sources = scored.map((s, i) => {
      const nameWithoutExt = (s.source || `文档${i + 1}`).replace(/\.[^/.]+$/, "");
      const snippetWithTitle = `[${i + 1}]《${nameWithoutExt}》：${(s.snippet || "").slice(0, 80)}……`;
      return { snippetWithTitle, score: s.score };
    });

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
    if (imagePath) {
      try {
        await fsp.unlink(imagePath);
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
