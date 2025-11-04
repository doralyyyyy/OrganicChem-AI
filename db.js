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

export function getAllChunks() {
  return db
    .prepare(
      "SELECT c.id, c.doc_id, c.content, c.embedding, d.filename FROM chunks c LEFT JOIN docs d ON c.doc_id = d.id"
    )
    .all();
}

export function getChunksByDoc(doc_id) {
  return db
    .prepare("SELECT id, doc_id, content, embedding FROM chunks WHERE doc_id = ?")
    .all(doc_id);
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
