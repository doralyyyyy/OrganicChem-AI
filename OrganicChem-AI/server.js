import path from "path";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai/index.js";
import multer from "multer";
import fs from "fs";
import { ingestFileToDB, getEmbedding } from "./ingest-utils.js";
import { listDocs, getAllChunks, insertChat, getChats, clearChats } from "./db.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// DeepSeek 客户端
const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1"
});

// multer 上传目录
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || "";
    // const base = path.basename(file.originalname, ext);
    // cb(null, base + "-" + Date.now() + ext);
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

// 回答问题接口
app.post("/api/solve", async (req, res) => {
  const { question, session_id="default" } = req.body;
  if (!question) return res.status(400).json({ error: true, message: "Missing question" });

  try {
    const qEmb = await getEmbedding(question);

    const rows = getAllChunks();
    const scored = rows.map(r => {
      const emb = JSON.parse(r.embedding);
      return { ...r, score: cosineSim(qEmb, emb) };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    const contextPieces = scored.map((r, i) => `[${i + 1}] ${r.content.slice(0, 1200)}`);
    const contextText = contextPieces.join("\n\n");

    // 取历史
    const history = getChats(session_id, 10);

    const messages = [
      {
        role: "system",
        content: `你是有机化学助教，回答要详细、有条理。如果相关信息在下面的检索到的知识片段中，请在引用时标注编号，如“[1]、[2]”，并且引用编号时请严格用 KaTeX 上标形式，例如：
          张嵩仁$^{[1][2]}$`
      },
      ...history.map(h => ({ role: h.role, content: h.content })),
      {
        role: "user",
        content: `检索到的相关知识（供参考）：\n${contextText}\n\n问题：${question}`
      }
    ];

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      temperature: 0.2
    });

    const answerText = completion.choices[0].message.content;

    // 保存到数据库
    insertChat(session_id, "user", question);
    insertChat(session_id, "assistant", answerText);

    // 处理来源引用
    const sources = scored.map((s, i) => {
      const nameWithoutExt = (s.filename || `文档${s.doc_id}`).replace(/\.[^/.]+$/, '');
      const snippetWithTitle = `[${i + 1}]《${nameWithoutExt}》：${s.content.slice(0, 50)}……`;
      return {
        snippetWithTitle,
        score: s.score,
        doc_id: s.doc_id
      };
    });

    res.json({
      id: Date.now(),
      query: question,
      text: answerText,
      sources
    });
  } catch (err) {
    console.error("RAG error:", err.response?.data || err.message || err);
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

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
