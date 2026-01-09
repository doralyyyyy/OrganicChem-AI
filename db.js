// db.js
import Database from "better-sqlite3";

const db = new Database("./memory.db");

// 适度提升并发/稳定性
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// 表结构
// 书籍表
db.prepare(`
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cover_path TEXT,
  created_at INTEGER
);
`).run();

// 章节表
db.prepare(`
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at INTEGER,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
`).run();

// 文档表（章节对应一个文档）
db.prepare(`
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  chapter_id TEXT,
  filename TEXT,
  text TEXT,
  created_at INTEGER,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);
`).run();

// 兼容旧数据：添加chapter_id列（如果不存在）
try {
  db.prepare("ALTER TABLE docs ADD COLUMN chapter_id TEXT").run();
} catch (err) {
  if (err.message && !err.message.includes("duplicate column name") && !err.message.includes("no such column")) {
    console.warn("Warning: Could not add chapter_id column:", err.message);
  }
}

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
db.prepare(`CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_docs_chapter_id ON docs(chapter_id)`).run();

// 知识库方法
export function insertDoc(id, filename, text, chapterId = null) {
  const stmt = db.prepare("INSERT INTO docs (id, chapter_id, filename, text, created_at) VALUES (?, ?, ?, ?, ?)");
  stmt.run(id, chapterId, filename, text, Date.now());
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

// 书籍相关方法
export function createBook(id, title, coverPath = null) {
  const stmt = db.prepare("INSERT INTO books (id, title, cover_path, created_at) VALUES (?, ?, ?, ?)");
  stmt.run(id, title, coverPath, Date.now());
}

export function updateBook(id, title, coverPath = null) {
  const stmt = db.prepare("UPDATE books SET title = ?, cover_path = ? WHERE id = ?");
  const info = stmt.run(title, coverPath, id);
  return info.changes > 0;
}

export function getBookById(bookId) {
  return db.prepare("SELECT id, title, cover_path, created_at FROM books WHERE id = ?").get(bookId);
}

export function listBooks() {
  return db.prepare("SELECT id, title, cover_path, created_at FROM books ORDER BY created_at DESC").all();
}

// 获取书籍列表（带统计信息：章节数、分块数）
export function listBooksWithStats() {
  const sql = `
    SELECT 
      b.id,
      b.title,
      b.cover_path,
      b.created_at,
      COUNT(DISTINCT c.id) AS chapter_count,
      COUNT(DISTINCT ch.id) AS chunk_count
    FROM books b
    LEFT JOIN chapters c ON c.book_id = b.id
    LEFT JOIN docs d ON d.chapter_id = c.id
    LEFT JOIN chunks ch ON ch.doc_id = d.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `;
  return db.prepare(sql).all();
}

export function deleteBook(bookId) {
  // 由于外键级联删除，删除书籍会自动删除章节、文档和分块
  const info = db.prepare("DELETE FROM books WHERE id = ?").run(bookId);
  return info.changes > 0;
}

// 章节相关方法
export function createChapter(id, bookId, title, orderIndex = 0) {
  const stmt = db.prepare("INSERT INTO chapters (id, book_id, title, order_index, created_at) VALUES (?, ?, ?, ?, ?)");
  stmt.run(id, bookId, title, orderIndex, Date.now());
}

export function updateChapter(id, title, orderIndex = null) {
  if (orderIndex !== null) {
    const stmt = db.prepare("UPDATE chapters SET title = ?, order_index = ? WHERE id = ?");
    const info = stmt.run(title, orderIndex, id);
    return info.changes > 0;
  } else {
    const stmt = db.prepare("UPDATE chapters SET title = ? WHERE id = ?");
    const info = stmt.run(title, id);
    return info.changes > 0;
  }
}

export function getChapterById(chapterId) {
  return db.prepare("SELECT id, book_id, title, order_index, created_at FROM chapters WHERE id = ?").get(chapterId);
}

export function getChaptersByBook(bookId) {
  return db.prepare("SELECT id, book_id, title, order_index, created_at FROM chapters WHERE book_id = ? ORDER BY order_index ASC, created_at ASC").all(bookId);
}

export function deleteChapter(chapterId) {
  // 由于外键级联删除，删除章节会自动删除文档和分块
  const info = db.prepare("DELETE FROM chapters WHERE id = ?").run(chapterId);
  return info.changes > 0;
}

// 更新文档的chapter_id（用于兼容旧数据或上传新章节）
export function updateDocChapter(docId, chapterId) {
  const stmt = db.prepare("UPDATE docs SET chapter_id = ? WHERE id = ?");
  const info = stmt.run(chapterId, docId);
  return info.changes > 0;
}

// 获取章节的文档（一个章节对应一个文档）
export function getDocByChapter(chapterId) {
  return db.prepare("SELECT id, chapter_id, filename, text, created_at FROM docs WHERE chapter_id = ?").get(chapterId);
}

// 统计章节的分块数
export function countChunksForChapter(chapterId) {
  const sql = `
    SELECT COUNT(*) AS n 
    FROM chunks ch
    JOIN docs d ON ch.doc_id = d.id
    WHERE d.chapter_id = ?
  `;
  const row = db.prepare(sql).get(chapterId);
  return row?.n || 0;
}

// 获取章节的所有chunks
export function getChunksByChapter(chapterId) {
  const sql = `
    SELECT ch.id, ch.doc_id, ch.content, ch.embedding, ch.created_at
    FROM chunks ch
    JOIN docs d ON ch.doc_id = d.id
    WHERE d.chapter_id = ?
    ORDER BY ch.created_at ASC, ch.id ASC
  `;
  return db.prepare(sql).all(chapterId);
}

export default db;
