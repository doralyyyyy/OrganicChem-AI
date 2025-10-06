import path from "path";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import OpenAI from "openai/index.js";
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

// 百度 OCR 文本识别函数
async function callBaiduOCR(imagePath) {
  const BAIDU_OCR_TOKEN = process.env.BAIDU_OCR_TOKEN;
  const imageBuffer = fs.readFileSync(imagePath);
  const imgBase64 = imageBuffer.toString('base64');
  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${BAIDU_OCR_TOKEN}`;

  const resp = await axios.post(url, 
    `image=${encodeURIComponent(imgBase64)}`, 
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  if (resp.data && resp.data.words_result) {
    const words = resp.data.words_result.map(o => o.words).join('；');
    return words;
  } else {
    throw new Error("文字识别失败");
  }
}

// Imago 结构式识别函数
async function recognizeStructureWithImago(imagePath) {
  const imagoPath = process.env.IMAGO_PATH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "imago-"));
  const outFile = path.join(tmpDir, "out.mol");

  // 清理临时目录
  function cleanup() {
    try { 
      fs.rmSync(tmpDir, { recursive: true, force: true }); 
    } catch (e) {}
  }

  return new Promise((resolve, reject) => {
    execFile(imagoPath, [imagePath, "-o", outFile], { timeout: 60_000 }, (err, stdout, stderr) => {
      if (!err) {
        // 读取 outFile
        try {
          const mol = fs.readFileSync(outFile, "utf8");
          cleanup();
          return resolve(mol);
        } catch (e) {
          // 如果读取失败，回退
          console.warn("Imago: -o 模式下读取 outFile 失败，尝试回退。", e);
        }
      } else {
        console.warn("Imago -o 调用失败，尝试回退模式。", err && err.message, stderr);
      }

        cleanup();
        const lastErr =  err || new Error("Imago 识别失败，未产出 mol");
        return reject(lastErr);
    });
  });
}

// mol 转换为 SMILES
async function molToSmiles(molString) {
  return new Promise((resolve, reject) => {
    const proc = execFile("obabel", ["-imol", "-", "-osmi"], { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err);
      resolve(stdout.trim());
    });
    proc.stdin.write(molString);
    proc.stdin.end();
  });
}

const uploadSolve = multer({ dest:"uploads/" });

// 综合函数：读取图片 同时进行 OCR 文本识别与结构式识别 后拼接
async function recognizeImageContent(imagePath) {
  let textPart = "";
  let structurePart = "";
  try {
    textPart = await callBaiduOCR(imagePath);
  } catch (e) {
    console.warn("OCR 文本识别失败:", e.message);
    textPart = "";
  }

  try {
    const molData = await recognizeStructureWithImago(imagePath);
    if (molData && molData.trim()) {
      let smiles = "";
      try {
        smiles = await molToSmiles(molData);
      } catch (e) {
        console.warn("SMILES 转换失败:", e);
      }
      structurePart = smiles;
    }
  } catch (e) {
    console.warn("结构式识别失败:", e);
    structurePart = "";
  }

  // 拼接
  let desc = "";
  if (textPart) {
    desc += `[图片文字]\n${textPart}\n`;
  }
  if (structurePart) {
    desc += `[图片结构式]\n${structurePart}\n`;
  }
  if (!desc) {
    desc = `(用户上传了一张图片: 无法识别内容)`;
  }
  return desc;
}

// 回答问题接口
app.post("/api/solve", uploadSolve.single("image"), async (req, res) => {
  try {
    const question=req.body.question;
    const session_id=req.body.session_id||"default";
    const imagePath=req.file?req.file.path:null;
    if(!question && !imagePath) return res.status(400).json({error:true,message:"Missing question or image"});

    // 如果有图片，走 OCR
    let imageDescription="";
    if(imagePath){
      imageDescription = await recognizeImageContent(imagePath);
    }
    const fullQuestion = imageDescription ? `${question}\n${imageDescription}` : question;

    const qEmb=await getEmbedding(fullQuestion);
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
        content: `你是大学有机化学助教，需要为学生提供详细、有条理的解答。请遵循以下要求：
        1. 回答必须清晰分段，包含必要的反应方程式、机理解释、实验条件、区域/立体选择性原因、常见错误与总结。
        2. 不要输出任何图片，仅使用文字或 LaTeX 格式书写化学式和方程式。
        3. 如果用户提供的图片中包含结构式，可以结合文字描述分析；若图片结构式过于复杂、罕见或明显为识别错误，则忽略图片结构式，仅基于文字进行回答。
        4. 若调用到后面给你的检索到的相关知识，请在回答中严格使用 KaTeX 上标形式标注参考编号，例如：$^{[1][2]}$。不要写“根据检索到的相关知识”或类似措辞，直接在相关内容处标注引用编号即可。`
      },
      ...history.map(h => ({ role: h.role, content: h.content })),
      {
        role: "user",
        content: `检索到的相关知识（供参考）：\n${contextText}\n\n${fullQuestion}`
      }
    ];

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      temperature: 0.2
    });

    const answerText = completion.choices[0].message.content;

    // 保存到数据库
    insertChat(session_id, "user", fullQuestion);
    insertChat(session_id, "assistant", answerText);

    // 处理来源引用
    const sources = scored.map((s, i) => {
      const nameWithoutExt = (s.filename || `文档${s.doc_id}`).replace(/\.[^/.]+$/, '');
      const snippetWithTitle = `[${i + 1}]《${nameWithoutExt}》：${s.content.slice(0, 80)}……`;  // 引用前80字
      return {
        snippetWithTitle,
        score: s.score,
        doc_id: s.doc_id
      };
    });

    if(imagePath) fs.unlinkSync(imagePath);

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
app.post("/api/feedback", async (req,res)=> {
  try {
    const {message,session_id}=req.body;
    if(!message) return res.json({ok:false,message:"Empty message"});
    
    const transporter=nodemailer.createTransport({
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      auth: {
          user: process.env.FEEDBACK_EMAIL_USER,
          pass: process.env.FEEDBACK_EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from:`OrganicChem AI <${process.env.FEEDBACK_EMAIL_USER}>`,
      to:"1017944978@qq.com",
      subject:`[OrganicChem-AI 使用反馈] from ${session_id}`,
      text:message
    });

    res.json({ok:true});
  } catch (err) {
    console.error(err);
    res.json({ok:false,message:err.message});
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
