import path from "path";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { ingestFileToDB, getEmbedding } from "./ingest-utils.js";
import { listDocs, getAllChunks, insertChat, getChats, clearChats } from "./db.js";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// 使用 cors 中间件，允许所有来源访问
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));
app.use(express.json());

// multer 上传目录
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || "";
    cb(null, uuidv4() + ext);   // 保留扩展名
  }
});
const upload = multer({ storage });

// 余弦相似度函数
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a) {
  return Math.sqrt(dot(a, a));
}
function cosineSim(a, b) {
  return dot(a, b) / (norm(a) * norm(b) + 1e-8);
}

// 上传并导入文档
app.post("/api/ingest", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: true, message: "Missing file" });
    const { path: fp } = req.file;

    let originalname = req.file.originalname;
    try {
      originalname = Buffer.from(originalname, "latin1").toString("utf8");
    } catch (e) {
      console.warn("Filename encoding fix failed:", e);
    }
    const result = await ingestFileToDB(fp, originalname, {
      onProgress: ({ total, done }) => {
        console.log(`Ingesting ${originalname} : ${done}/${total}`);
      }
    });
    try { fs.unlinkSync(fp); } catch (e) {}
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Ingest error:", err);
    res.status(500).json({ error: true, message: err.message || String(err) });
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

// 检索接口（调试用）
app.post("/api/search", async (req, res) => {
  const { query, topK = 5 } = req.body;
  if (!query) return res.status(400).json({ error: true, message: "Missing query" });

  try {
    const qEmb = await getEmbedding(query);

    const rows = getAllChunks();
    const scored = rows.map(r => {
      const emb = JSON.parse(r.embedding);
      return { ...r, score: cosineSim(qEmb, emb) };
    }).sort((a, b) => b.score - a.score).slice(0, topK);

    res.json({ query, topK, results: scored });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: true, message: err.message || String(err) });
  }
});

// 获取图片描述
async function recognizeImageContent(imagePath) {
  const prompt = "请对这张图的内容做尽可能详细的描述，保证你的描述能涵盖图片中的所有信息。仅输出该描述，不要输出其他多余内容。";

  const imageDescription = await chatVision(imagePath, prompt);
  return imageDescription;
}

// 调用 GPT-4o Vision 进行图像解析
async function chatVision(imagePath, prompt = "请解析这张图", model = "gpt-4o") {
  let imageItem;
  if (/^https?:\/\//i.test(imagePath)) {
    imageItem = { type: "image_url", image_url: { url: imagePath } };
  } else {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const mime = (await import("mime-types")).default;
    const buf = await fs.readFile(imagePath);
    const b64 = buf.toString("base64");
    const m = mime.lookup(path.extname(imagePath)) || "image/png";
    imageItem = { type: "image_url", image_url: { url: `data:${m};base64,${b64}` } };
  }

  const r = await fetch(`${process.env.BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.AIZEX_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          imageItem
        ]
      }]
    })
  });
  const j = await r.json();
  return j.choices[0].message.content;
}

// 回答问题接口
app.post("/api/solve", upload.single("image"), async (req, res) => {
  try {
    const question = req.body.question;
    const session_id = req.body.session_id || "default";
    const imagePath = req.file ? req.file.path : null;

    if (!question && !imagePath) return res.status(400).json({ error: true, message: "Missing question or image" });

    // 如果有图片，先做识别，用于数据库记录（不用于发给模型）
    let imageDescription = "";
    if (imagePath) {
      imageDescription = await recognizeImageContent(imagePath);
    }

    // 检索和存储的完整问题 = 文字 + 图片描述
    const fullQuestion = imageDescription ? `${question}\n${imageDescription}` : question;

    // 检索知识库
    const qEmb = await getEmbedding(fullQuestion);
    const rows = getAllChunks();
    const scored = rows.map(r => {
      const emb = JSON.parse(r.embedding);
      return { ...r, score: cosineSim(qEmb, emb) };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    const contextPieces = scored.map((r, i) => `[${i + 1}] ${r.content.slice(0, 1200)}`);
    const contextText = contextPieces.join("\n\n");
    const history = getChats(session_id, 10);

    // 构造消息数组
    const baseMessages = [
      {
        role: "system",
        content: `你是大学有机化学助教，需要为学生提供详细、有条理的解答。请遵循以下要求：
        1. 回答必须清晰分段，包含必要的反应方程式、机理解释、实验条件、区域/立体选择性原因、常见错误与总结。
        2. 不要输出任何图片，仅使用文字或 LaTeX 格式书写化学式和方程式。
        3. 如果用户提供的图片中包含结构式，可以结合文字描述分析；若图片结构式过于复杂、罕见或明显为识别错误，则忽略图片结构式，仅基于文字进行回答。
        4. 若需要用到后面给你的检索到的相关知识，请在回答中严格使用 KaTeX 上标形式标注参考编号，例如：$^{[1][2]}$。不要写“根据检索到的相关知识”这种措辞，直接输出你的回答，并在相关内容处标注引用编号即可。`
      },
      ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    // 构造用户消息
    let userContent = [{ type: "text", text: `检索到的相关知识（供参考）：\n${contextText}\n\n${question}` }];

    // 如果有图片，则附上图片内容一起发给模型
    if (imagePath) {
      const fsPromises = await import("node:fs/promises");
      const mime = (await import("mime-types")).default;
      const buf = await fsPromises.readFile(imagePath);
      const b64 = buf.toString("base64");
      const m = mime.lookup(path.extname(imagePath)) || "image/png";
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${m};base64,${b64}` }
      });
    }

    const messages = [
      ...baseMessages,
      { role: "user", content: userContent }
    ];

    const r = await fetch(`${process.env.BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.AIZEX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages
      })
    });

    const j = await r.json();
    if (!j.choices || !j.choices[0]) throw new Error("Invalid response from Aizex API");
    const answerText = j.choices[0].message.content;

    // 存储聊天记录（含识别描述）
    insertChat(session_id, "user", fullQuestion);
    insertChat(session_id, "assistant", answerText);

    const sources = scored.map((s, i) => {
      const nameWithoutExt = (s.filename || `文档${s.doc_id}`).replace(/\.[^/.]+$/, '');
      const snippetWithTitle = `[${i + 1}]《${nameWithoutExt}》：${s.content.slice(0, 80)}……`;
      return { snippetWithTitle, score: s.score, doc_id: s.doc_id };
    });

    if (imagePath) fs.unlinkSync(imagePath);

    res.json({
      id: Date.now(),
      query: question,
      text: answerText,
      sources
    });
  } catch (err) {
    console.error("Solve error:", err.response?.data || err.message || err);
    res.status(500).json({
      error: true,
      message: err.response?.data || err.message || "Unknown error",
      sources: []
    });
  }
});

// 清空历史记录接口
app.post("/api/clear", async (req, res) => {
  try {
    const { session_id } = req.body;
    const deleted = clearChats(session_id);
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message || String(err) });
  }
});

// 反馈接口
app.post("/api/feedback", async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message) return res.json({ ok: false, message: "Empty message" });

    const transporter = nodemailer.createTransport({
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.FEEDBACK_EMAIL_USER,
        pass: process.env.FEEDBACK_EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `OrganicChem AI <${process.env.FEEDBACK_EMAIL_USER}>`,
      to: "1017944978@qq.com",
      subject: `[OrganicChem-AI 使用反馈] from ${session_id}`,
      text: message
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, message: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
