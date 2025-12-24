
// db.js
import Database from "better-sqlite3";

const db = new Database("./memory.db");

// 适度提升并发/稳定性
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// 表结构
db.prepare(`
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  filename TEXT,
  text TEXT,
  created_at INTEGER
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT,
  content TEXT,
  embedding TEXT, -- 存储为 JSON 字符串
  created_at INTEGER
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  role TEXT,       -- 'user' | 'assistant'
  content TEXT,
  created_at INTEGER
);
`).run();

// 索引（提升查询性能）
db.prepare(`CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id, created_at)`).run();

// 知识库方法
export function insertDoc(id, filename, text) {
  const stmt = db.prepare("INSERT INTO docs (id, filename, text, created_at) VALUES (?, ?, ?, ?)");
  stmt.run(id, filename, text, Date.now());
}

export function insertChunk(id, doc_id, content, embedding /* 数组 */) {
  const stmt = db.prepare("INSERT INTO chunks (id, doc_id, content, embedding, created_at) VALUES (?, ?, ?, ?, ?)");
  stmt.run(id, doc_id, content, JSON.stringify(embedding), Date.now());
}

export function listDocs() {
  return db.prepare("SELECT id, filename, created_at FROM docs ORDER BY created_at DESC").all();
}

// 新增：带 chunk 数统计
export function listDocsWithStats() {
  const sql = `
    SELECT d.id, d.filename, d.created_at, COUNT(c.id) AS chunk_count
    FROM docs d
    LEFT JOIN chunks c ON c.doc_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `;
  return db.prepare(sql).all();
}

export function getAllChunks() {
  return db
    .prepare(
      "SELECT c.id, c.doc_id, c.content, c.embedding, d.filename FROM chunks c LEFT JOIN docs d ON c.doc_id = d.id"
    )
    .all();
}

// 细化：获取文档详情
export function getDocById(doc_id) {
  return db.prepare("SELECT id, filename, text, created_at FROM docs WHERE id = ?").get(doc_id);
}

// 统计某文档 chunks 数
export function countChunksForDoc(doc_id) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE doc_id = ?").get(doc_id);
  return row?.n || 0;
}

// 修改：附带 created_at，embedding 保持返回，兼容之前用途
export function getChunksByDoc(doc_id) {
  return db
    .prepare("SELECT id, doc_id, content, embedding, created_at FROM chunks WHERE doc_id = ? ORDER BY created_at ASC, id ASC")
    .all(doc_id);
}

// 删除单个 chunk
export function deleteChunkById(chunk_id) {
  const info = db.prepare("DELETE FROM chunks WHERE id = ?").run(chunk_id);
  return info.changes || 0;
}

// 删除整个文档（含其所有 chunks）
export function deleteDocCascade(doc_id) {
  const delChunks = db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(doc_id).changes || 0;
  const delDoc = db.prepare("DELETE FROM docs WHERE id = ?").run(doc_id).changes || 0;
  return { delChunks, delDoc };
}

// 对话记忆方法
export function insertChat(session_id, role, content) {
  const stmt = db.prepare("INSERT INTO chats (session_id, role, content, created_at) VALUES (?, ?, ?, ?)");
  stmt.run(session_id, role, content, Date.now());
}

export function getChats(session_id, limit = 20) {
  return db
    .prepare("SELECT role, content FROM chats WHERE session_id=? ORDER BY created_at ASC LIMIT ?")
    .all(session_id, limit);
}

export function clearChats(session_id) {
  const stmt = db.prepare("DELETE FROM chats WHERE session_id=?");
  const info = stmt.run(session_id);
  return info.changes;
}

export default db;
