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

// 添加 user_id 列（如果不存在）- SQLite 不支持直接检查列是否存在
try {
  db.prepare("ALTER TABLE chats ADD COLUMN user_id INTEGER").run();
} catch (err) {
  // 列已存在或其他错误，忽略
  if (err.message && !err.message.includes("duplicate column name") && !err.message.includes("no such column")) {
    console.warn("Warning: Could not add user_id column:", err.message);
  }
}

// 用户表
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER
);
`).run();

// 验证码表
db.prepare(`
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'register' | 'login'
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER
);
`).run();

// 索引（提升查询性能）
db.prepare(`CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id, created_at)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id, created_at)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email, expires_at)`).run();

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

// 带 chunk 数统计
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

// 获取文档详情
export function getDocById(doc_id) {
  return db.prepare("SELECT id, filename, text, created_at FROM docs WHERE id = ?").get(doc_id);
}

// 统计某文档 chunks 数
export function countChunksForDoc(doc_id) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE doc_id = ?").get(doc_id);
  return row?.n || 0;
}

// 附带 created_at，embedding 保持返回，兼容之前用途
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

// 用户相关方法
export function createUser(username, email, passwordHash) {
  const stmt = db.prepare("INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)");
  const info = stmt.run(username, email, passwordHash, Date.now());
  return info.lastInsertRowid;
}

export function getUserByUsername(username) {
  return db.prepare("SELECT id, username, email, password_hash FROM users WHERE username = ?").get(username);
}

export function getUserByEmail(email) {
  return db.prepare("SELECT id, username, email, password_hash FROM users WHERE email = ?").get(email);
}

export function getUserById(id) {
  return db.prepare("SELECT id, username, email FROM users WHERE id = ?").get(id);
}

export function checkUsernameExists(username) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users WHERE username = ?").get(username);
  return (row?.count || 0) > 0;
}

export function checkEmailExists(email) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users WHERE email = ?").get(email);
  return (row?.count || 0) > 0;
}

// 验证码相关方法
export function createVerificationCode(email, code, type, expiresInMinutes = 10) {
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
  const stmt = db.prepare("INSERT INTO verification_codes (email, code, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?)");
  stmt.run(email, code, type, expiresAt, Date.now());
}

export function verifyCode(email, code, type) {
  const row = db.prepare(`
    SELECT id FROM verification_codes 
    WHERE email = ? AND code = ? AND type = ? AND expires_at > ? AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email, code, type, Date.now());
  
  if (row) {
    // 标记为已使用
    db.prepare("UPDATE verification_codes SET used = 1 WHERE id = ?").run(row.id);
    return true;
  }
  return false;
}

export function cleanupExpiredCodes() {
  db.prepare("DELETE FROM verification_codes WHERE expires_at < ?").run(Date.now());
}

// 对话记忆方法（兼容旧版本，优先使用user_id）
export function insertChat(session_id, role, content, user_id = null) {
  const stmt = db.prepare("INSERT INTO chats (session_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)");
  stmt.run(session_id, user_id, role, content, Date.now());
}

export function getChats(session_id, limit = 20, user_id = null) {
  if (user_id) {
    return db
      .prepare("SELECT id, role, content, created_at FROM chats WHERE user_id=? ORDER BY created_at ASC LIMIT ?")
      .all(user_id, limit);
  }
  // 兼容旧版本：使用session_id
  return db
    .prepare("SELECT id, role, content, created_at FROM chats WHERE session_id=? ORDER BY created_at ASC LIMIT ?")
    .all(session_id, limit);
}

export function clearChats(session_id, user_id = null) {
  if (user_id) {
    const stmt = db.prepare("DELETE FROM chats WHERE user_id=?");
    const info = stmt.run(user_id);
    return info.changes;
  }
  // 兼容旧版本：使用session_id
  const stmt = db.prepare("DELETE FROM chats WHERE session_id=?");
  const info = stmt.run(session_id);
  return info.changes;
}

export default db;
