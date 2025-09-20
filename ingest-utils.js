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

// 有道 API embedding
export async function getEmbedding(text) {
    const appKey = process.env.YOUDAO_APP_KEY;
    const appSecret = process.env.YOUDAO_APP_SECRET;
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

    const params = new URLSearchParams();
    params.append("appKey", appKey);
    params.append("curtime", curtime);
    params.append("q", text);
    params.append("salt", salt);
    params.append("sign", sign);
    params.append("signType", "v3");

    const res = await axios.post(
        "https://openapi.youdao.com/textEmbedding/queryTextEmbeddings",
        params
    );

    if (!res.data?.result?.embeddingList?.[0]) {
      throw new Error("有道 API 返回结果异常: " + JSON.stringify(res.data));
    }
    return res.data.result.embeddingList[0];
}

function chunkText(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        start += chunkSize - overlap;
        // start = Math.max(end - overlap, end);
    }
    return chunks;
}

async function extractTextFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
        const data = fs.readFileSync(filePath);
        const out = await pdfParse(data);
        return out.text;
    } else if (ext === ".docx") {
        const result = await mammoth.extractRawText({ path: filePath });
        // 强制去掉不可打印字符
        return (result.value || "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    } else {
        return fs.readFileSync(filePath, { encoding: "utf8" }); // 强制 utf8
    }
}

export async function ingestFileToDB(filePath, filename, opts = { chunkSize: 1000, overlap: 200, onProgress: null }) {
    const docId = uuidv4();
    const text = await extractTextFromFile(filePath);

    // console.log("读取到文本前200字符:", text.slice(0, 200)); // 调试用

    insertDoc(docId, filename, text || "");

    const chunks = chunkText(text || "", opts.chunkSize, opts.overlap);
    let i = 0;
    for (const c of chunks) {
        // 跳过空文本
        if (!c.trim()) continue;

        // 每块延迟 300~500ms，避免 QPS 超限
        await new Promise(r => setTimeout(r, 400));

        const emb = await getEmbedding(c);
        const chunkId = uuidv4();
        insertChunk(chunkId, docId, c, JSON.stringify(emb));
        i++;
        if (opts.onProgress) opts.onProgress({ total: chunks.length, done: i, lastChunkId: chunkId });
    }

    return { docId, filename, totalChunks: chunks.length };
}
