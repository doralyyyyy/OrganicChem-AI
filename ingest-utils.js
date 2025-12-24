// ingest-utils.js
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pdfParse from "pdf-parse-fixed";
import mammoth from "mammoth";
import { v4 as uuidv4 } from "uuid";
import { insertDoc, insertChunk } from "./db.js";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

// 工具函数
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sanitizeText(s = "") {
  // 去除不可打印字符、标准化空白
  return (s || "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const n = text.length;
  let start = 0;
  const step = Math.max(1, chunkSize - Math.max(0, overlap));
  while (start < n) {
    const end = Math.min(start + chunkSize, n);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start += step;
  }
  return chunks;
}

export async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const data = fs.readFileSync(filePath);
    const out = await pdfParse(data);
    return sanitizeText(out.text || "");
  } else if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return sanitizeText(result.value || "");
  } else {
    // txt/markdown/其他纯文本
    return sanitizeText(fs.readFileSync(filePath, { encoding: "utf8" }));
  }
}

// 有道 Embedding 调用
let lastEmbedCall = 0; // 全局速率限制
const MIN_INTERVAL_MS = Number(process.env.YOUDAO_MIN_INTERVAL_MS) || 1200; // 默认 ~0.8 QPS
const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS) || 20_000;
const EMBED_MAX_RETRIES = Number(process.env.EMBED_MAX_RETRIES) || 8;
const EMBED_MAX_BACKOFF_MS = Number(process.env.EMBED_MAX_BACKOFF_MS) || 30_000;

function signForYoudao(text, appKey, appSecret) {
  const curtime = Math.floor(Date.now() / 1000).toString();
  const salt = Math.random().toString(36).slice(2);

  let input;
  if (text.length > 20) {
    input = text.slice(0, 10) + text.length + text.slice(-10);
  } else {
    input = text;
  }
  const signStr = appKey + input + salt + curtime + appSecret;
  const sign = crypto.createHash("sha256").update(signStr, "utf8").digest("hex");

  return { curtime, salt, sign };
}

function shouldRetryYoudao(err, data) {
  const http = err?.response?.status;
  const code = data?.errorCode;
  if (http === 429) return true;            // HTTP 限流
  if (!http && err?.code === "ECONNABORTED") return true; // 超时
  if (http >= 500) return true;             // 服务端波动
  // 有道错误码：411/412/… 常见限流/余额问题
  if (code === "411" || code === "412" || code === "500") return true;
  return false;
}

function pickEmbeddingVector(item) {
  // 兼容几种返回结构：
  // 1) item 为数组: [0.1, 0.2, ...]
  // 2) item.embedding / item.vector / item.values 为数组
  if (!item) return null;
  if (Array.isArray(item)) return item;
  if (Array.isArray(item.embedding)) return item.embedding;
  if (Array.isArray(item.vector)) return item.vector;
  if (Array.isArray(item.values)) return item.values;
  return null;
}

async function youdaoEmbeddingWithRetry(text) {
  const appKey = process.env.YOUDAO_APP_KEY;
  const appSecret = process.env.YOUDAO_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("YOUDAO_APP_KEY / YOUDAO_APP_SECRET 未配置");
  }

  // 全局最小间隔（QPS 限制）
  const since = Date.now() - lastEmbedCall;
  if (since < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - since);
  }

  let attempt = 0;
  while (true) {
    attempt += 1;

    const { curtime, salt, sign } = signForYoudao(text, appKey, appSecret);
    const params = new URLSearchParams();
    params.append("appKey", appKey);
    params.append("curtime", curtime);
    params.append("q", text);
    params.append("salt", salt);
    params.append("sign", sign);
    params.append("signType", "v3");

    try {
      const res = await axios.post(
        "https://openapi.youdao.com/textEmbedding/queryTextEmbeddings",
        params,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: EMBED_TIMEOUT_MS,
        }
      );
      lastEmbedCall = Date.now();

      const list = res.data?.result?.embeddingList;
      if (!list?.length) {
        throw new Error("有道返回为空或无 embeddingList");
      }
      const vec = pickEmbeddingVector(list[0]);
      if (!Array.isArray(vec) || typeof vec[0] !== "number") {
        throw new Error("有道返回的 embedding 不是数字数组");
      }
      return vec;
    } catch (err) {
      const data = err?.response?.data;
      const retryable = shouldRetryYoudao(err, data);
      if (!retryable || attempt >= EMBED_MAX_RETRIES) {
        throw new Error(
          `有道 API 调用失败（attempt=${attempt}）：` +
            (data ? JSON.stringify(data) : err.message || String(err))
        );
      }

      // 指数退避 + 抖动
      const base = Math.min(EMBED_MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 400);
      const delay = Math.max(MIN_INTERVAL_MS, base + jitter);
      // 为 411（qps/balance）错误再额外增加缓冲
      const extra = data?.errorCode === "411" ? 1200 : 0;

      const wait = delay + extra;
      console.warn(
        `[youdao-embed] retry in ${wait}ms (attempt ${attempt}) ->`,
        data || err.message
      );
      await sleep(wait);
    }
  }
}

// 对外导出：获取单段文本的 embedding
export async function getEmbedding(text) {
  const s = sanitizeText(text || "");
  if (!s) return [];
  return youdaoEmbeddingWithRetry(s);
}

// 主流程：文件入库 + 向量化
export async function ingestFileToDB(
  filePath,
  filename,
  opts = { chunkSize: 1000, overlap: 200, onProgress: null }
) {
  const docId = uuidv4();
  const text = await extractTextFromFile(filePath);

  insertDoc(docId, filename, text || "");

  const chunkSize = Number(opts.chunkSize) || 1000;
  const overlap = Number(opts.overlap) || 200;
  const chunks = chunkText(text || "", chunkSize, overlap);

  let i = 0;
  for (const c of chunks) {
    if (!c.trim()) continue;

    // 不要在这里固定 sleep，速率控制与退避已放到 getEmbedding 里做得更智能
    const emb = await getEmbedding(c);

    const chunkId = uuidv4();
    // 仅传原始数组，避免二次 stringify
    insertChunk(chunkId, docId, c, emb);

    i++;
    if (opts.onProgress) {
      opts.onProgress({ total: chunks.length, done: i, lastChunkId: chunkId });
    }
  }

  return { docId, filename, totalChunks: chunks.length };
}