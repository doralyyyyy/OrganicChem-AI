import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { BookOpen, ChevronLeft, X, Search, Upload } from "lucide-react";

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

// 文档管理内使用的加载动画
function AnimatedLoader({ label = "系统正在检索答案…", size = 160, imgSrc = "/anim/ai-loader.gif" }) {
  const [useImg, setUseImg] = React.useState(true);
  return (
    <div className="flex flex-col items-center gap-4 py-6 select-none">
      {useImg ? (
        <div className="relative">
          <img
            src={imgSrc}
            alt="AI 正在思考"
            width={size}
            height={size}
            className="oc-loader rounded-xl ring-2 ring-indigo-200 shadow-lg object-contain pointer-events-none pulse-glow"
            onError={() => setUseImg(false)}
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-400/20 to-purple-400/20 animate-pulse"></div>
        </div>
      ) : (
        <div className="oc-loader relative" role="img" aria-label="AI 正在思考的动画">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/50 to-purple-100/50 rounded-full blur-xl"></div>
          <svg viewBox="0 0 120 120" aria-hidden="true" className="relative z-10">
            <defs>
              <linearGradient id="ocGradDoc" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#6366f1" />
                <stop offset="50%"  stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
              <filter id="ocGlowDoc" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <g className="oc-ring">
              <circle cx="60" cy="60" r="44" fill="none" stroke="url(#ocGradDoc)" strokeWidth="3" />
            </g>
            <g className="oc-hex" filter="url(#ocGlowDoc)">
              <polygon
                points="60,28 84,42 84,72 60,86 36,72 36,42"
                fill="none"
                stroke="url(#ocGradDoc)"
                strokeWidth="2.5"
              />
              <circle className="oc-dot d1" cx="60" cy="28" r="2.5" />
              <circle className="oc-dot d2" cx="84" cy="42" r="2.5" />
              <circle className="oc-dot d3" cx="84" cy="72" r="2.5" />
              <circle className="oc-dot d4" cx="60" cy="86" r="2.5" />
              <circle className="oc-dot d5" cx="36" cy="72" r="2.5" />
              <circle className="oc-dot d6" cx="36" cy="42" r="2.5" />
            </g>
          </svg>
        </div>
      )}
      <div className="text-sm text-slate-600 font-medium flex items-center gap-2">
        <span className="loading-dots">
          <span></span><span></span><span></span>
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}

// 章节标题输入模态框
function ChapterTitleModal({ defaultTitle, onClose, onSubmit }) {
  const [title, setTitle] = useState(defaultTitle);

  function handleSubmit() {
    if (!title.trim()) {
      alert("请输入章节标题");
      return;
    }
    onSubmit(title.trim());
  }

  return (
    <div className="fixed inset-0 z-[101] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border-2 border-purple-100 p-6 max-w-md w-full"
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-600">
          <span>📝</span>
          <span>请输入章节标题</span>
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">章节标题 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="请输入章节标题"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSubmit();
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            确定
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// 新建书籍模态框
function NewBookModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  function handleFileSelect(file) {
    if (file && file.type.startsWith("image/")) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setCoverPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setDragActive(true);
    }
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }

  function handleSubmit() {
    if (!title.trim()) {
      alert("请输入书名");
      return;
    }
    onSubmit(title.trim(), coverFile);
  }

  return (
    <div className="fixed inset-0 z-[101] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border-2 border-indigo-100 p-6 max-w-md w-full"
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-600">
          <span>📚</span>
          <span>新建书籍</span>
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">书名 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="请输入书名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">封面（可选）</label>
            <label
              className={`flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-xl cursor-pointer transition ${
                dragActive
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload size={20} className="text-indigo-600" />
              <span className="text-sm text-slate-600">
                {dragActive ? "松开以上传封面" : "拖拽图片到此处，或点击选择"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            {coverPreview && (
              <div className="mt-3 relative inline-block">
                <img src={coverPreview} alt="预览" className="max-h-40 rounded border" />
                <button
                  onClick={() => {
                    setCoverFile(null);
                    setCoverPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-white border shadow hover:bg-slate-100"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            创建
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// 编辑书籍模态框
function EditBookModal({ book, onClose, onSubmit }) {
  const [title, setTitle] = useState(book.title);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const API = import.meta.env.VITE_API_BASE;

  function handleFileSelect(file) {
    if (file && file.type.startsWith("image/")) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setCoverPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setDragActive(true);
    }
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }

  async function handleSubmit() {
    if (!title.trim()) {
      alert("请输入书名");
      return;
    }
    await onSubmit(book.id, title.trim(), coverFile);
  }

  function getCoverUrl(coverPath) {
    if (!coverPath) return null;
    if (coverPath.startsWith("http")) return coverPath;
    return `${API}${coverPath}`;
  }

  return (
    <div className="fixed inset-0 z-[101] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border-2 border-indigo-100 p-6 max-w-md w-full"
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
          <span>✏️</span>
          <span>编辑书籍</span>
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">书名 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="请输入书名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">封面（可选）</label>
            <label
              className={`flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-xl cursor-pointer transition ${
                dragActive
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload size={20} className="text-indigo-600" />
              <span className="text-sm text-slate-600">
                {dragActive ? "松开以上传封面" : "拖拽图片到此处，或点击选择"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            {(coverPreview || book.cover_path) && (
              <div className="mt-3 relative inline-block">
                <img
                  src={coverPreview || getCoverUrl(book.cover_path)}
                  alt="预览"
                  className="max-h-40 rounded border"
                />
                {coverPreview && (
                  <button
                    onClick={() => {
                      setCoverFile(null);
                      setCoverPreview(null);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-full bg-white border shadow hover:bg-slate-100"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            保存
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// 删除密码验证模态框
function DeletePasswordModal({ onClose, password, onPasswordChange, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[102] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border-2 border-red-100 p-6 max-w-md w-full"
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600">
          <span>⚠️</span>
          <span>删除操作需要验证</span>
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">请输入删除密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="请输入密码"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onConfirm();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            确认删除
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// 文档管理器
function DocumentManager({ onClose, onUploadChapter }) {
  const API = import.meta.env.VITE_API_BASE;
  const [view, setView] = useState("books"); // 'books' | 'chapters' | 'chunks'
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [bookFilter, setBookFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [chunkFilter, setChunkFilter] = useState("");
  const [message, setMessage] = useState("");
  const [showNewBookModal, setShowNewBookModal] = useState(false);
  const [showEditBookModal, setShowEditBookModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [pendingDeleteAction, setPendingDeleteAction] = useState(null);
  const [editingChapter, setEditingChapter] = useState(null);
  const [showChapterTitleModal, setShowChapterTitleModal] = useState(false);
  const [pendingChapterFile, setPendingChapterFile] = useState(null);
  const [chapterUploading, setChapterUploading] = useState(false);
  const [chapterUploadMsg, setChapterUploadMsg] = useState("");
  const [chapterDragActive, setChapterDragActive] = useState(false);
  const [draggedChapterIndex, setDraggedChapterIndex] = useState(null);

  const totalChunks = useMemo(
    () => books.reduce((s, b) => s + (b.chunk_count || 0), 0),
    [books]
  );

  function promptDeletePassword() {
    return new Promise((resolve) => {
      setPendingDeleteAction(() => resolve);
      setShowDeletePasswordModal(true);
      setDeletePassword("");
    });
  }

  async function fetchBooks() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/books`);
      const data = await res.json();
      if (data?.ok) {
        setBooks(data.books || []);
      } else {
        setMessage(data?.message || "加载失败");
      }
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchChapters(bookId) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/book/${bookId}/chapters`);
      const data = await res.json();
      if (data?.ok) {
        setChapters(data.chapters || []);
      } else {
        setMessage(data?.message || "加载失败");
      }
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchChunks(chapterId) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/chapter/${chapterId}/chunks`);
      const data = await res.json();
      if (data?.ok) {
        setChunks(data.chunks || []);
      } else {
        setMessage(data?.message || "加载失败");
      }
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openBook(book) {
    setSelectedBook(book);
    await fetchChapters(book.id);
    setView("chapters");
    setChapterFilter("");
  }

  async function openChapter(chapter) {
    setSelectedChapter(chapter);
    await fetchChunks(chapter.id);
    setView("chunks");
    setChunkFilter("");
  }

  async function deleteBook(bookId) {
    const password = await promptDeletePassword();
    if (!password) return;

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/book/${bookId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "删除失败");
      await fetchBooks();
      if (selectedBook?.id === bookId) {
        setSelectedBook(null);
        setView("books");
      }
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteChapter(chapterId) {
    const password = await promptDeletePassword();
    if (!password) return;

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/chapter/${chapterId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "删除失败");
      if (selectedBook) {
        await fetchChapters(selectedBook.id);
      }
      if (selectedChapter?.id === chapterId) {
        setSelectedChapter(null);
        setView("chapters");
      }
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteChunk(chunkId) {
    const password = await promptDeletePassword();
    if (!password) return;

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/chunk/${chunkId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "删除失败");
      setChunks((cs) => cs.filter((c) => c.id !== chunkId));
      if (selectedChapter) {
        const chapterRes = await fetch(`${API}/api/chapter/${selectedChapter.id}`);
        const chapterData = await chapterRes.json();
        if (chapterData?.ok) {
          setSelectedChapter(chapterData.chapter);
        }
      }
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function createBook(title, coverFile) {
    setLoading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("title", title);
      if (coverFile) {
        formData.append("cover", coverFile);
      }

      const res = await fetch(`${API}/api/books`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "创建失败");
      await fetchBooks();
      setShowNewBookModal(false);
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function updateBook(bookId, title, coverFile) {
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("title", title);
      if (coverFile) {
        formData.append("cover", coverFile);
      }

      const res = await fetch(`${API}/api/book/${bookId}`, {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`请求失败: ${res.status} ${res.statusText}`);
        }
        throw new Error(errorData.message || "更新失败");
      }

      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "更新失败");
      await fetchBooks();
      if (selectedBook?.id === bookId) {
        setSelectedBook(data.book);
      }
      setShowEditBookModal(false);
    } catch (e) {
      console.error("Update book error:", e);
      setMessage(e.message || String(e));
    }
  }

  async function createChapter(bookId, title) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: bookId, title }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "创建失败");
      await fetchChapters(bookId);
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function updateChapter(chapterId, title, orderIndex) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/api/chapter/${chapterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, order_index: orderIndex }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "更新失败");
      if (selectedBook) {
        await fetchChapters(selectedBook.id);
      }
      setEditingChapter(null);
    } catch (e) {
      setMessage(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleChapterUpload(chapterId, file) {
    if (!file) return;
    setChapterUploading(true);
    setChapterUploadMsg(`正在上传 ${file.name} ...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("chapter_id", chapterId);
      const resp = await fetch(`${API}/api/ingest`, {
        method: "POST",
        body: formData,
      });
      const text = await resp.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("服务器返回格式异常");
      }
      if (resp.ok && data.ok) {
        setChapterUploadMsg(`✅ 已导入 ${data.filename}，分块数 ${data.totalChunks}`);
        setTimeout(() => {
          setChapterUploadMsg("");
        }, 3000);
      } else {
        setChapterUploadMsg(`❌ 失败: ${data.message || "未知错误"}`);
      }
    } catch (err) {
      setChapterUploadMsg(`❌ 错误: ${err.message}`);
    } finally {
      setChapterUploading(false);
      if (selectedBook) {
        await fetchChapters(selectedBook.id);
      }
    }
  }

  async function reorderChapters(sourceIndex, destinationIndex) {
    if (sourceIndex === destinationIndex) return;

    const newChapters = [...chapters];
    const [removed] = newChapters.splice(sourceIndex, 1);
    newChapters.splice(destinationIndex, 0, removed);

    try {
      const updatePromises = newChapters.map(async (chapter, index) => {
        const res = await fetch(`${API}/api/chapter/${chapter.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: chapter.title, order_index: index }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            throw new Error(`请求失败: ${res.status} ${res.statusText}`);
          }
          throw new Error(errorData.message || "更新章节失败");
        }

        const data = await res.json();
        if (!data?.ok) {
          throw new Error(data?.message || "更新章节失败");
        }
        return data;
      });
      await Promise.all(updatePromises);

      if (selectedBook) {
        await fetchChapters(selectedBook.id);
      }
    } catch (e) {
      console.error("Reorder chapters error:", e);
      setMessage(e.message || String(e));
    }
  }

  useEffect(() => {
    fetchBooks();
  }, []);

  const filteredBooks = useMemo(() => {
    const q = bookFilter.trim().toLowerCase();
    return !q
      ? books
      : books.filter((b) => (b.title || "").toLowerCase().includes(q));
  }, [bookFilter, books]);

  const filteredChapters = useMemo(() => {
    const q = chapterFilter.trim().toLowerCase();
    return !q
      ? chapters
      : chapters.filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [chapterFilter, chapters]);

  const filteredChunks = useMemo(() => {
    const q = chunkFilter.trim().toLowerCase();
    return !q
      ? chunks
      : chunks.filter((c) => (c.content || "").toLowerCase().includes(q));
  }, [chunkFilter, chunks]);

  function handleDeletePasswordConfirm() {
    if (!deletePassword) {
      setMessage("请输入密码");
      return;
    }
    setShowDeletePasswordModal(false);
    if (pendingDeleteAction) {
      const resolve = pendingDeleteAction;
      setPendingDeleteAction(null);
      resolve(deletePassword);
      setDeletePassword("");
    }
  }

  function handleDeletePasswordCancel() {
    setShowDeletePasswordModal(false);
    if (pendingDeleteAction) {
      const resolve = pendingDeleteAction;
      setPendingDeleteAction(null);
      resolve(null);
    }
    setDeletePassword("");
  }

  function getCoverUrl(coverPath) {
    if (!coverPath) return null;
    if (coverPath.startsWith("http")) return coverPath;
    return `${API}${coverPath}`;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border-2 border-indigo-100 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b-2 border-indigo-100 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50">
            <div className="flex items-center gap-3">
              {(view === "chapters" || view === "chunks") && (
                <button
                  onClick={() => {
                    if (view === "chunks") {
                      setView("chapters");
                      setSelectedChapter(null);
                    } else {
                      setView("books");
                      setSelectedBook(null);
                    }
                  }}
                  className="p-2 rounded-md hover:bg-slate-100"
                  title="返回"
                  aria-label="返回"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-indigo-600" />
                <span className="font-semibold">
                  {view === "books" && "文档管理"}
                  {view === "chapters" && selectedBook && `《${selectedBook.title}》章节管理`}
                  {view === "chunks" && selectedChapter && `《${selectedChapter.title}》分块管理`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {view === "books" && (
                <button
                  onClick={() => setShowNewBookModal(true)}
                  className="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
                >
                  新建书籍
                </button>
              )}
              {view === "chapters" && selectedBook && (
                <button
                  onClick={() => setShowEditBookModal(true)}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm"
                >
                  编辑书籍
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-md hover:bg-slate-100"
                aria-label="关闭"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 overflow-y-auto max-h-[85vh]">
            {message && (
              <div className="mb-3 text-sm text-red-600">{message}</div>
            )}

            {view === "books" && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="text-sm text-slate-600">
                    共 <b>{books.length}</b> 本书籍，<b>{totalChunks}</b> 个分块
                  </div>
                  <div className="relative">
                    <Search size={16} className="absolute left-2 top-2.5 text-slate-400" />
                    <input
                      value={bookFilter}
                      onChange={(e) => setBookFilter(e.target.value)}
                      placeholder="搜索书名..."
                      className="pl-8 pr-3 py-2 border rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="py-6"><AnimatedLoader label="正在加载书籍…" size={120} /></div>
                ) : filteredBooks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="text-5xl mb-3">📚</div>
                    <div className="text-sm text-slate-600 font-medium">暂无书籍或未匹配到搜索结果</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBooks.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl border-2 border-indigo-100 bg-white overflow-hidden hover:shadow-xl transition-shadow cursor-pointer hover:border-indigo-300"
                        onClick={() => openBook(b)}
                      >
                        <div className="aspect-[3/4] bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 flex items-center justify-center overflow-hidden relative">
                          {getCoverUrl(b.cover_path) ? (
                            <img
                              src={getCoverUrl(b.cover_path)}
                              alt={b.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                          ) : null}
                          {!getCoverUrl(b.cover_path) && (
                            <div className="w-full h-full flex items-center justify-center text-indigo-600">
                              <BookOpen size={48} />
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="font-medium truncate mb-2" title={b.title}>{b.title}</div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                            <span>{b.chapter_count || 0} 章节</span>
                            <span>{b.chunk_count || 0} 分块</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openBook(b);
                              }}
                              className="flex-1 px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 text-sm btn-animated shadow-md hover:shadow-lg transition-all"
                            >
                              查看
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBook(b.id);
                              }}
                              className="px-3 py-1.5 rounded-md border-2 border-red-200 text-sm hover:bg-red-50 hover:border-red-400 hover:text-red-600 transition-all"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === "chapters" && selectedBook && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="text-sm text-slate-600">
                    共 <b>{chapters.length}</b> 个章节
                  </div>
                  <div className="relative">
                    <Search size={16} className="absolute left-2 top-2.5 text-slate-400" />
                    <input
                      value={chapterFilter}
                      onChange={(e) => setChapterFilter(e.target.value)}
                      placeholder="搜索章节..."
                      className="pl-8 pr-3 py-2 border rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
                    />
                  </div>
                </div>

                <div
                  className={`mb-4 p-6 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
                    chapterDragActive
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.types.includes('Files')) {
                      setChapterDragActive(true);
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX;
                    const y = e.clientY;
                    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                      setChapterDragActive(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setChapterDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      setPendingChapterFile(file);
                      setShowChapterTitleModal(true);
                    }
                  }}
                >
                  <label className="flex flex-col items-center cursor-pointer">
                    <Upload size={24} className={`mb-2 ${chapterDragActive ? "text-indigo-600" : "text-indigo-500"}`} />
                    <span className={`text-sm font-medium ${chapterDragActive ? "text-indigo-600" : "text-slate-600"}`}>
                      {chapterDragActive ? "松开以上传章节" : "上传新章节"}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      拖拽文件到此处，或点击选择文件
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPendingChapterFile(file);
                          setShowChapterTitleModal(true);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {chapterUploading && (
                    <div className="mt-3 text-xs text-slate-500 text-center">{chapterUploadMsg}</div>
                  )}
                  {!chapterUploading && chapterUploadMsg && (
                    <div className="mt-3 text-xs text-center">{chapterUploadMsg}</div>
                  )}
                </div>

                {loading ? (
                  <div className="py-6"><AnimatedLoader label="正在加载章节…" size={120} /></div>
                ) : filteredChapters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="text-5xl mb-3">📖</div>
                    <div className="text-sm text-slate-600 font-medium">暂无章节或未匹配到搜索结果</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredChapters.map((c, idx) => {
                      const originalIndex = chapters.findIndex(ch => ch.id === c.id);
                      return (
                        <div
                          key={c.id}
                          draggable={editingChapter?.id !== c.id}
                          onDragStart={(e) => {
                            if (editingChapter?.id === c.id) return;
                            setDraggedChapterIndex(originalIndex);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedChapterIndex !== null && draggedChapterIndex !== originalIndex) {
                              reorderChapters(draggedChapterIndex, originalIndex);
                            }
                            setDraggedChapterIndex(null);
                          }}
                          onDragEnd={() => {
                            setDraggedChapterIndex(null);
                          }}
                          className={`border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow ${
                            editingChapter?.id === c.id ? "" : "cursor-move"
                          } ${draggedChapterIndex === originalIndex ? "opacity-50" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              {editingChapter?.id === c.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    defaultValue={c.title}
                                    className="flex-1 px-2 py-1 border rounded text-sm"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        updateChapter(c.id, e.target.value, c.order_index);
                                      } else if (e.key === "Escape") {
                                        setEditingChapter(null);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => setEditingChapter(null)}
                                    className="px-2 py-1 text-xs border rounded"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="text-slate-400 cursor-move" title="拖拽排序">
                                    ⋮⋮
                                  </div>
                                  <div
                                    className="font-medium cursor-pointer hover:text-indigo-600 flex-1"
                                    onClick={() => openChapter(c)}
                                  >
                                    {idx + 1}. {c.title}
                                  </div>
                                </div>
                              )}
                              <div className="text-xs text-slate-500 mt-1 ml-6">
                                {c.chunk_count || 0} 个分块
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditingChapter(c)}
                                className="px-2 py-1 text-xs border rounded hover:bg-slate-50"
                              >
                                重命名
                              </button>
                              <button
                                onClick={() => openChapter(c)}
                                className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                              >
                                查看
                              </button>
                              <button
                                onClick={() => deleteChapter(c.id)}
                                className="px-2 py-1 text-xs border rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {view === "chunks" && selectedChapter && (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-sm text-slate-600">
                    分块（{filteredChunks.length}/{chunks.length}）
                  </div>
                  <div className="relative">
                    <Search size={16} className="absolute left-2 top-2.5 text-slate-400" />
                    <input
                      value={chunkFilter}
                      onChange={(e) => setChunkFilter(e.target.value)}
                      placeholder="在分块内搜索..."
                      className="pl-8 pr-3 py-2 border rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="py-6"><AnimatedLoader label="正在加载分块…" size={120} /></div>
                ) : filteredChunks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="text-5xl mb-3">📄</div>
                    <div className="text-sm text-slate-600 font-medium">暂无分块或未匹配到搜索结果</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredChunks.map((c, i) => (
                      <div key={c.id} className="border rounded-lg p-3 bg-white hover:shadow-sm transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs text-slate-500">
                            #{i + 1} · {c.created_at ? formatDate(c.created_at) : ""}
                          </div>
                          <button
                            onClick={() => deleteChunk(c.id)}
                            className="text-xs px-2 py-1 rounded-md border hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                          >
                            删除
                          </button>
                        </div>
                        <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap leading-6">
                          {c.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onSubmit={createBook}
        />
      )}

      {showEditBookModal && selectedBook && (
        <EditBookModal
          book={selectedBook}
          onClose={() => setShowEditBookModal(false)}
          onSubmit={updateBook}
        />
      )}

      {showDeletePasswordModal && (
        <DeletePasswordModal
          onClose={handleDeletePasswordCancel}
          password={deletePassword}
          onPasswordChange={setDeletePassword}
          onConfirm={handleDeletePasswordConfirm}
        />
      )}

      {showChapterTitleModal && (
        <ChapterTitleModal
          defaultTitle={pendingChapterFile?.name?.replace(/\.[^/.]+$/, "") || ""}
          onClose={() => {
            setShowChapterTitleModal(false);
            setPendingChapterFile(null);
          }}
          onSubmit={async (title) => {
            if (!title.trim() || !pendingChapterFile) return;
            const file = pendingChapterFile;
            setShowChapterTitleModal(false);
            setPendingChapterFile(null);

            try {
              const res = await fetch(`${API}/api/chapters`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ book_id: selectedBook.id, title: title.trim() }),
              });
              const data = await res.json();
              if (data?.ok && data.chapter) {
                handleChapterUpload(data.chapter.id, file);
              } else {
                setMessage(data?.message || "创建章节失败");
              }
            } catch (err) {
              setMessage(err.message || "创建章节失败");
            }
          }}
        />
      )}
    </>
  );
}

export default DocumentManager;
