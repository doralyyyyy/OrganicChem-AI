import "./App.css";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Send,
  RefreshCw,
  Printer,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  Mic,
  Paperclip,
  StopCircle,
  Copy,
  Download,
  X,
  BookOpen,
  ChevronLeft,
  Search,
  LogIn,
  LogOut,
  User,
  PenTool
} from "lucide-react";
import Auth from "./Auth.jsx";
import ChemDrawSelector from "./ChemDrawSelector.jsx";
import { BiSend } from "react-icons/bi";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";

// 界面参数
const MAX_HISTORY = 50;
const PANEL_H = "h-[115vh] sm:h-[110vh] md:h-[96vh]"; // 左侧卡片固定高度

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}
function preprocessMathDelimiters(s = "") {
  if (!s) return "";
  s = s.replace(/\\\[(.*?)\\\]/gs, (_, g1) => `$$${g1}$$`);
  s = s.replace(/\\\((.*?)\\\)/gs, (_, g1) => `$${g1}$`);
  s = s.replace(/\u2212/g, "-");
  return s;
}
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 化学主题加载动画
// 支持优先使用 /anim/ai-loader.gif（若存在），否则回退到内联 SVG 动画
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
              <linearGradient id="ocGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#6366f1" />
                <stop offset="50%"  stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
              <filter id="ocGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* 外圈：渐变描边 + 旋转 + 虚线流动 */}
            <g className="oc-ring">
              <circle cx="60" cy="60" r="44" fill="none" stroke="url(#ocGrad)" strokeWidth="3" />
            </g>

            {/* 六边形：呼吸感 + 节点脉冲 */}
            <g className="oc-hex" filter="url(#ocGlow)">
              <polygon
                points="60,28 84,42 84,72 60,86 36,72 36,42"
                fill="none"
                stroke="url(#ocGrad)"
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

  // 获取删除密码（同步方式）
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
    
    // 更新所有章节的order_index（不设置loading，避免UI卡顿）
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
      
      // 刷新章节列表
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 删除密码验证处理
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
    if (!coverPath) return null; // 返回null，使用CSS占位符
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
          {/* 顶部条 */}
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

          {/* 内容区 */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[85vh]">
            {message && (
              <div className="mb-3 text-sm text-red-600">{message}</div>
            )}

            {/* 书籍列表视图 */}
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

            {/* 章节列表视图 */}
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

                {/* 上传新章节 */}
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
                          draggable
                          onDragStart={(e) => {
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
                          className={`border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow cursor-move ${
                            draggedChapterIndex === originalIndex ? "opacity-50" : ""
                          }`}
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

            {/* 分块列表视图 */}
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

      {/* 新建书籍模态框 */}
      {showNewBookModal && (
        <NewBookModal
          onClose={() => setShowNewBookModal(false)}
          onSubmit={createBook}
        />
      )}

      {/* 编辑书籍模态框 */}
      {showEditBookModal && selectedBook && (
        <EditBookModal
          book={selectedBook}
          onClose={() => setShowEditBookModal(false)}
          onSubmit={updateBook}
        />
      )}

      {/* 删除密码验证模态框 */}
      {showDeletePasswordModal && (
        <DeletePasswordModal
          onClose={handleDeletePasswordCancel}
          password={deletePassword}
          onPasswordChange={setDeletePassword}
          onConfirm={handleDeletePasswordConfirm}
        />
      )}

      {/* 章节标题输入模态框 */}
      {showChapterTitleModal && (
        <ChapterTitleModal
          defaultTitle={pendingChapterFile?.name?.replace(/\.[^/.]+$/, "") || ""}
          onClose={() => {
            setShowChapterTitleModal(false);
            setPendingChapterFile(null);
          }}
          onSubmit={async (title) => {
            if (!title.trim() || !pendingChapterFile) return;
            // 先关闭模态框
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
                // 立即开始上传，不等待
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

// 主函数
function App() {
  const [question, setQuestion] = useState("");
  const [smiles, setSmiles] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [image, setImage] = useState(null);
  const [file, setFile] = useState(null); // 用于存储文件（非图片）
  const [smilesError, setSmilesError] = useState("");
  const [docMgrOpen, setDocMgrOpen] = useState(false);

  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("oc_history_v1")) || [];
    } catch {
      return [];
    }
  });
  const [historySearch, setHistorySearch] = useState("");

  const canvasRef = useRef(null);
  const answerRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [inputDragActive, setInputDragActive] = useState(false); // 输入框区域的拖拽状态
  const [uploadAreaDragActive, setUploadAreaDragActive] = useState(false); // 上传按钮区域的拖拽状态
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const allowedDocTypes = useMemo(
    () => [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    []
  );

  const fileInputRef = useRef(null); // 用于重置文件输入

  const [feedback, setFeedback] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showChemDrawSelector, setShowChemDrawSelector] = useState(false);

  // 登录状态
  const [user, setUser] = useState(() => {
    try {
      const userInfo = localStorage.getItem("user_info");
      return userInfo ? JSON.parse(userInfo) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => {
    return localStorage.getItem("auth_token") || null;
  });
  const [showAuth, setShowAuth] = useState(false);

  // Abort controller
  const requestControllerRef = useRef(null);
  // speech
  const recognitionRef = useRef(null);
  // smiles-drawer readiness
  const [smilesLibReady, setSmilesLibReady] = useState(
    typeof window !== "undefined" && !!window.SmilesDrawer
  );

  // session id（兼容旧版本，如果已登录则使用user_id）
  const session_id = useMemo(() => {
    if (user) {
      return `user_${user.id}`;
    }
    let sid = localStorage.getItem("oc_session_id");
    if (!sid) {
      sid =
        "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("oc_session_id", sid);
    }
    return sid;
  }, [user]);

  // 登录处理
  async function handleLogin(userData, authToken) {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("auth_token", authToken);
    localStorage.setItem("user_info", JSON.stringify(userData));
    
    // 登录后从服务器获取历史记录
    try {
      const headers = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${authToken}`;
      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/history?limit=${MAX_HISTORY}`, {
        method: "GET",
        headers,
      });
      const data = await resp.json();
      if (data.ok && data.history && Array.isArray(data.history)) {
        setHistory(data.history);
        localStorage.setItem("oc_history_v1", JSON.stringify(data.history));
      }
    } catch (err) {
      console.error("获取历史记录失败:", err);
    }
  }

  // 登出处理
  function handleLogout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_info");
    setHistory([]);
    localStorage.removeItem("oc_history_v1");
  }

  // 保存历史记录到localStorage（但登录用户优先使用服务器数据）
  useEffect(() => {
    if (!user) {
      // 未登录用户才保存到localStorage
      localStorage.setItem("oc_history_v1", JSON.stringify(history));
    }
  }, [history, user]);

  // 登录后或token变化时，从服务器获取历史记录
  useEffect(() => {
    if (user && token) {
      async function fetchHistory() {
        try {
          const headers = { "Content-Type": "application/json" };
          headers["Authorization"] = `Bearer ${token}`;
          const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/history?limit=${MAX_HISTORY}`, {
            method: "GET",
            headers,
          });
          const data = await resp.json();
          if (data.ok && data.history && Array.isArray(data.history)) {
            setHistory(data.history);
          }
        } catch (err) {
          console.error("获取历史记录失败:", err);
        }
      }
      fetchHistory();
    }
  }, [user, token]);

  // dynamic load SmilesDrawer
  useEffect(() => {
    if (smilesLibReady) return;
    const existed = document.querySelector(
      'script[data-sd="smiles-drawer-cdn"]'
    );
    if (existed) return;
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/smiles-drawer@2.1.2/dist/smiles-drawer.min.js";
    script.async = true;
    script.dataset.sd = "smiles-drawer-cdn";
    script.onload = () => setSmilesLibReady(true);
    script.onerror = () => setSmilesLibReady(false);
    document.head.appendChild(script);
  }, [smilesLibReady]);

  // image preview
  const imagePreviewURL = useMemo(() => {
    if (!image) return null;
    return URL.createObjectURL(image);
  }, [image]);
  useEffect(() => {
    return () => {
      if (imagePreviewURL) URL.revokeObjectURL(imagePreviewURL);
    };
  }, [imagePreviewURL]);

  // 判断文件是否为图片
  const isImageFile = (file) => {
    return file && file.type && file.type.startsWith("image/");
  };

  // upload docs
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!allowedDocTypes.includes(file.type)) {
      setUploadMsg("❌ 仅支持上传 PDF、Word、TXT 文件");
      return;
    }

    setUploading(true);
    setUploadMsg(`正在上传 ${file.name} ...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/ingest`, {
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
        setUploadMsg(`✅ 已导入 ${data.filename}，分块数 ${data.totalChunks}`);
      } else {
        setUploadMsg(`❌ 失败: ${data.message || "未知错误"}`);
      }
    } catch (err) {
      setUploadMsg(`❌ 错误: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  // speech
  function handleVoiceInput() {
    if (!("webkitSpeechRecognition" in window)) {
      alert("你的浏览器不支持语音识别，请使用最新版 Chrome");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const r = new window.webkitSpeechRecognition();
    recognitionRef.current = r;
    r.lang = "zh-CN";
    r.continuous = false;
    r.interimResults = false;
    setListening(true);
    r.start();

    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setQuestion((q) => (q ? q + " " + t : t));
    };
    r.onerror = (e) => {
      console.error("语音识别错误:", e);
      alert("语音识别出错：" + e.error);
    };
    r.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
  }

  // 处理文件选择（图片或文件）
  function handleFileSelect(selectedFile) {
    if (!selectedFile) {
      setImage(null);
      setFile(null);
      return;
    }
    
    if (isImageFile(selectedFile)) {
      setImage(selectedFile);
      setFile(null);
    } else {
      // 检查是否为允许的文档类型
      if (allowedDocTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setImage(null);
      } else {
        alert("不支持的文件类型，请上传图片、PDF、Word 或 TXT 文件");
        return;
      }
    }
  }

  // 处理输入框区域的拖拽
  function handleInputDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setInputDragActive(true);
    }
  }

  function handleInputDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // 只有当真正离开容器时才取消拖拽状态
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setInputDragActive(false);
    }
  }

  function handleInputDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setInputDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      handleFileSelect(file);
    }
  }

  // 处理上传按钮区域的拖拽
  function handleUploadAreaDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setUploadAreaDragActive(true);
    }
  }

  function handleUploadAreaDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // 只有当真正离开容器时才取消拖拽状态
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setUploadAreaDragActive(false);
    }
  }

  function handleUploadAreaDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setUploadAreaDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      handleFileSelect(file);
    }
  }

  // 将粘贴事件里的图片转换为 File 并放入现有 image 状态
  function handlePasteToTextarea(e) {
    const cd = e.clipboardData;
    if (!cd) return;

    // 1) 直接从剪贴板的 file/items 里找图片（优先）
    const items = Array.from(cd.items || []);
    const fileItem = items.find(it => it.kind === "file" && it.type && it.type.startsWith("image/"));
    if (fileItem) {
      const blob = fileItem.getAsFile();
      if (blob) {
        const ext = (blob.type?.split("/")?.[1] || "png").toLowerCase();
        const iso = new Date().toISOString().replace(/[:.]/g, "-");
        const name = (blob.name && blob.name !== "image") ? blob.name : `pasted-${iso}.${ext}`;
        const file = new File([blob], name, { type: blob.type || "image/png" });

        handleFileSelect(file);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      return;
    }

    // 2) 兜底：从 HTML 里找 <img src="..."> 并抓取（可能受 CORS 限制）
    const html = cd.getData("text/html");
    if (html) {
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const img = doc.querySelector("img");
        const src = img?.src || img?.getAttribute("src");
        if (src && /^https?:/i.test(src)) {
          fetch(src)
            .then(res => res.blob())
            .then(blob => {
              if (!blob || !blob.type.startsWith("image/")) return;
              const ext = (blob.type.split("/")[1] || "png").toLowerCase();
              const iso = new Date().toISOString().replace(/[:.]/g, "-");
              const name = `pasted-${iso}.${ext}`;
              const file = new File([blob], name, { type: blob.type });
              handleFileSelect(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            })
            .catch(() => {});
        }
      } catch {}
    }
  }

  // submit / cancel
  async function handleSubmit(e) {
    e?.preventDefault();
    if (!question.trim() && !image && !file) return;

    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }
    const controller = new AbortController();
    requestControllerRef.current = controller;

    setLoading(true);
    setAnswer(null);

    try {
      const formData = new FormData();
      formData.append("question", question);
      formData.append("session_id", session_id);
      if (image) {
        formData.append("image", image);
      } else if (file) {
        formData.append("file", file);
      }

      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/solve`, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });

      const raw = await resp.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { text: raw || "服务器返回非 JSON 内容", sources: [] };
      }

      if (data.sources && data.sources.length > 0) {
        const references = data.sources
          .map((s) => s.snippetWithTitle)
          .join("\n\n");
        data.text = (data.text || "") + `\n\n**引用来源：**\n\n${references}`;
      }

      setAnswer(data);
      setHistory((h) =>
        [{ ...data, query: question, localTs: Date.now() }, ...h].slice(
          0,
          MAX_HISTORY
        )
      );
    } catch (err) {
      if (err.name === "AbortError") {
        setAnswer({ text: "已取消请求。", sources: [] });
      } else {
        setAnswer({ text: `Error: ${err.message}`, sources: [] });
      }
    } finally {
      setLoading(false);
      requestControllerRef.current = null;
    }
  }
  function handleCancel() {
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }
  }
  function handleReset() {
    handleCancel();
    setQuestion("");
    setAnswer(null);
    setSmiles("");
    setSmilesError("");
    setImage(null);
    setFile(null);
    // 同时清空文件 input 的值，避免再次选择同一个文件没有触发 change
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // export / copy / download
  function handleExport() {
    const w = window.open("", "_blank");
    if (!w) return alert("Allow popups to export");

    const rendered = answerRef.current
      ? answerRef.current.innerHTML
      : `<pre>${escapeHtml(answer?.text || "")}</pre>`;
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Export</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>
body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; }
pre { white-space: pre-wrap; word-break: break-word; background: #fafafa; padding: 8px; border-radius: 6px; }
h1 { font-size: 20px; margin: 0 0 8px; }
h2 { font-size: 16px; margin-top: 18px; }
.katex .katex-mathml { display: none; }
@media print { .no-print { display: none; } }
</style>
</head>
<body>
<h1>Question</h1>
<pre>${escapeHtml(question)}</pre>
<h1>Answer</h1>
<div>${rendered}</div>
<script>window.onload = function(){ setTimeout(()=>window.print(), 300); };</script>
</body>
</html>`;
    w.document.write(html);
    w.document.close();
  }
  async function handleCopyAnswer() {
    const plain =
      answerRef.current?.innerText?.trim() || answer?.text || "";
    if (!plain) return;
    await navigator.clipboard?.writeText(plain);
  }
  function handleDownloadMarkdown() {
    const md = `# Question\n\n${question}\n\n# Answer\n\n${answer?.text || ""}\n`;
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `answer-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // clear history
  async function handleClearHistory() {
    setHistory([]);
    localStorage.removeItem("oc_history_v1");
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/clear`, {
        method: "POST",
        headers,
        body: JSON.stringify({ session_id }),
      });
      const data = await resp.json();
      if (!data.ok) {
        console.error("❌ 清空失败:", data.message);
      }
    } catch (err) {
      console.error("请求错误:", err);
    }
  }

  // feedback
  async function handleFeedback() {
    if (!feedback.trim()) {
      setFeedbackMsg("请输入反馈内容");
      return;
    }
    setSending(true);
    setFeedbackMsg("");
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id,
          message: feedback,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        setFeedbackMsg("✅ 感谢反馈，我们会尽快处理！");
        setFeedback("");
      } else {
        setFeedbackMsg("❌ 发送失败：" + (data.message || "未知错误"));
      }
    } catch (err) {
      setSending(false);
      setFeedbackMsg("❌ 网络错误：" + err.message);
    } finally {
      setSending(false);
    }
  }

  // SMILES 渲染 —— 即时（无防抖）+ 高清 DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const dpr = Math.max(window.devicePixelRatio || 1, 1);

    // 先设物理像素，后设变换矩阵，确保清晰
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    if (!smiles) { 
      setSmilesError("");
      return; 
    }
    if (!window.SmilesDrawer || !smilesLibReady) {
      setSmilesError("未找到 SmilesDrawer（正在加载库）");
      return;
    }

    setSmilesError("");
    try {
      const drawer = new window.SmilesDrawer.Drawer({ width: size, height: size });
      window.SmilesDrawer.parse(
        smiles,
        (tree) => drawer.draw(tree, canvas, "light", false),
        (err) => {
          console.error("SMILES 解析失败:", err);
          setSmilesError("SMILES 解析失败，请检查格式。");
        }
      );
    } catch (err) {
      console.error("SMILES 绘制失败:", err);
      setSmilesError("SMILES 绘制失败。");
    }
  }, [smiles, smilesLibReady]);

  // 固定粒子位置，避免重新渲染时改变
  const particlePositions = useMemo(() => {
    return Array.from({ length: 9 }, () => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
    }));
  }, []); // 空依赖数组，只在组件挂载时计算一次

  // UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-indigo-50/30 to-slate-50 p-3 sm:p-6 flex justify-center text-center relative overflow-hidden">
      {/* 背景粒子装饰 */}
      <div className="background-particles">
        {particlePositions.map((pos, i) => (
          <div key={i} className="particle" style={{ top: `${pos.top}%`, left: `${pos.left}%` }} />
        ))}
      </div>
      
      {/* 化学分子结构装饰 */}
      <div className="molecule-decoration" style={{ top: '10%', right: '5%', width: '200px', height: '200px' }}>
        <svg viewBox="0 0 100 100" className="w-full h-full text-indigo-300">
          <circle cx="50" cy="50" r="2" fill="currentColor" />
          <circle cx="30" cy="30" r="2" fill="currentColor" />
          <circle cx="70" cy="30" r="2" fill="currentColor" />
          <circle cx="30" cy="70" r="2" fill="currentColor" />
          <circle cx="70" cy="70" r="2" fill="currentColor" />
          <line x1="50" y1="50" x2="30" y2="30" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="50" x2="70" y2="30" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="50" x2="30" y2="70" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="50" x2="70" y2="70" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
      <div className="molecule-decoration" style={{ bottom: '15%', left: '3%', width: '150px', height: '150px' }}>
        <svg viewBox="0 0 100 100" className="w-full h-full text-purple-300" style={{ animationDirection: 'reverse' }}>
          <circle cx="50" cy="50" r="3" fill="currentColor" />
          <circle cx="20" cy="50" r="2" fill="currentColor" />
          <circle cx="80" cy="50" r="2" fill="currentColor" />
          <circle cx="50" cy="20" r="2" fill="currentColor" />
          <circle cx="50" cy="80" r="2" fill="currentColor" />
          <line x1="50" y1="50" x2="20" y2="50" stroke="currentColor" strokeWidth="1.5" />
          <line x1="50" y1="50" x2="80" y2="50" stroke="currentColor" strokeWidth="1.5" />
          <line x1="50" y1="50" x2="50" y2="20" stroke="currentColor" strokeWidth="1.5" />
          <line x1="50" y1="50" x2="50" y2="80" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      
      <div className="w-full max-w-6xl space-y-6 relative z-10">
        {/* Header */}
        <motion.header
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-indigo-100"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="ml-1 sm:ml-3">
            <h1 className="text-2xl sm:text-3xl font-bold whitespace-nowrap">OrganicChem AI助教</h1>
            <p className="mt-2 text-sm text-slate-600">
              交互式教学 · 可视化分子 · 可追溯知识单元
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center">
            {/* 第一行：登录/用户名+登出 */}
            <div className="flex gap-2 items-center">
              {user ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700">
                    <User size={14} />
                    <span className="text-sm font-medium">{user.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    type="button"
                    className="px-3 py-2 rounded-lg bg-red-600 text-white flex items-center gap-2 hover:bg-red-700 text-sm btn-animated shadow-md hover:shadow-lg transition-all"
                    aria-label="登出"
                    title="登出"
                  >
                    <LogOut size={14} /> <span>登出</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  type="button"
                  className="px-3 py-2 rounded-lg bg-indigo-600 text-white flex items-center gap-2 hover:bg-indigo-700 text-sm btn-animated shadow-md hover:shadow-lg transition-all"
                  aria-label="登录"
                  title="登录"
                >
                  <LogIn size={14} /> <span>登录</span>
                </button>
              )}
            </div>
            {/* 第二行：结构式绘制+文档管理+清除历史 */}
            <div className="flex gap-2 items-center">
                <button
                  onClick={() => setShowChemDrawSelector(true)}
                  type="button"
                  className="px-3 py-2 rounded-lg bg-purple-600 text-white flex items-center gap-2 hover:bg-purple-700 text-sm btn-animated shadow-md hover:shadow-lg transition-all"
                  aria-label="结构式绘制"
                  title="结构式绘制"
                >
                    <PenTool size={14} /> <span className="hidden sm:inline">结构式绘制</span>
                  </button>
                  <button
                    onClick={() => setDocMgrOpen(true)}
                    type="button"
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-700 text-sm btn-animated shadow-md hover:shadow-lg transition-all"
                    aria-label="文档管理"
                    title="文档管理"
                  >
                    <BookOpen size={14} /> <span className="hidden sm:inline">文档管理</span>
                  </button>
                  <button
                    onClick={handleClearHistory}
                    type="button"
                    className="px-3 py-2 rounded-lg bg-green-600 text-white flex items-center gap-2 hover:bg-green-700 text-sm btn-animated shadow-md hover:shadow-lg transition-all"
                    aria-label="清空历史"
                    title="清空历史"
                  >
                    <Trash2 size={14} /> <span className="hidden sm:inline">清除历史</span>
                  </button>
            </div>
          </div>
        </motion.header>

        {/* Main */}
        <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左侧：输入区 —— 固定高度 + 内部滚动；内容默认左对齐，标题单独居中 */}
          <section className={`md:col-span-1 bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-100 flex flex-col gap-4 overflow-hidden card-hover ${PANEL_H}`}>
            <form className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1" onSubmit={handleSubmit}>
              {/* 标题居中 */}
              <label className="text-lg font-semibold text-center flex items-center justify-center gap-2 text-indigo-600">
                <span>💡</span>
                <span>输入你的问题</span>
              </label>

              <div 
                className="relative"
                onDragOver={handleInputDragOver}
                onDragLeave={handleInputDragLeave}
                onDrop={handleInputDrop}
              >
                <textarea
                  rows={6}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onPaste={handlePasteToTextarea}
                  className={`w-full p-3 border-2 rounded-lg text-sm resize-none pr-12 transition-all ${
                    inputDragActive 
                      ? "border-indigo-500 ring-4 ring-indigo-200 ring-inset bg-indigo-50" 
                      : "border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:ring-inset focus:outline-none"
                  }`}
                  placeholder={inputDragActive ? "松开以上传文件" : "例如：解释 SN1 反应的机理..."}
                  aria-label="问题输入"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                />
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  className={`absolute right-1 bottom-2.5 p-2 rounded-md transition-colors ${
                    listening
                      ? "bg-red-500 text-white"
                      : "bg-slate-100 hover:bg-slate-200"
                  }`}
                  title={listening ? "正在聆听，点击停止" : "语音输入"}
                  aria-label={listening ? "停止语音输入" : "开始语音输入"}
                >
                  {listening ? <StopCircle size={16} /> : <Mic size={16} />}
                </button>
              </div>

              {/* 提交 & 快速提示 / 取消 */}
              <div className="flex gap-2 items-stretch">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60 btn-animated shadow-lg hover:shadow-xl transition-all"
                  aria-label="提交问题"
                  title="提交问题"
                >
                  <Send size={16} /> 
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span>正在分析</span>
                      <span className="loading-dots">
                        <span></span><span></span><span></span>
                      </span>
                    </span>
                  ) : (
                    "提交问题"
                  )}
                </button>

                {loading ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-2 rounded-xl border flex items-center gap-2 hover:bg-slate-50"
                    aria-label="取消请求"
                    title="取消请求"
                  >
                    <StopCircle size={16} />
                    取消
                  </button>
                ) : (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl border flex items-center gap-2 hover:bg-slate-50"
                        aria-haspopup="menu"
                        aria-label="快速提示"
                        title="快速提示"
                      >
                        快速提示
                        <ChevronDown size={16} />
                      </button>
                    </DropdownMenu.Trigger>
                    
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="start"
                        sideOffset={6}
                        className="z-50 bg-white border rounded-md shadow-md p-1 text-sm"
                      >
                        <DropdownMenu.Item
                          className="px-3 py-2 hover:bg-slate-100 rounded cursor-pointer"
                          onClick={() =>
                            setQuestion((q) => q + "\n请给出对应的 SMILES 式")
                          }
                        >
                          SMILES式
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="px-3 py-2 hover:bg-slate-100 rounded cursor-pointer"
                          onClick={() =>
                            setQuestion((q) => q + "\n请附带一个具体反应实例")
                          }
                        >
                          反应实例
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="px-3 py-2 hover:bg-slate-100 rounded cursor-pointer"
                          onClick={() =>
                            setQuestion((q) => q + "\n请结合实验应用及现象说明")
                          }
                        >
                          实验应用
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="px-3 py-2 hover:bg-slate-100 rounded cursor-pointer"
                          onClick={() =>
                            setQuestion((q) => q + "\n请生成一道相关练习题")
                          }
                        >
                          生成题目
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="px-3 py-2 hover:bg-slate-100 rounded cursor-pointer"
                          onClick={() =>
                            setQuestion((q) => q + "\n请总结本问题的学习要点")
                          }
                        >
                          总结要点
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="px-3 py-2 hover:bg-slate-100 rounded cursor-pointer"
                          onClick={() =>
                            setQuestion((q) => q + "\n请指出常见错误或误区")
                          }
                        >
                          常见错误
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                )}
              </div>

              {/* 上传图片或文件 */}
              <label 
                className={`flex flex-col items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  uploadAreaDragActive 
                    ? "border-indigo-500 bg-indigo-100 ring-4 ring-indigo-200 scale-105" 
                    : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-md"
                }`}
                onDragOver={handleUploadAreaDragOver}
                onDragLeave={handleUploadAreaDragLeave}
                onDrop={handleUploadAreaDrop}
              >
                <div className="flex items-center gap-2">
                  <Paperclip size={18} className="text-green-600" />
                  <span className="text-slate-600">
                    {image ? `已选择图片: ${image.name}` : file ? `已选择文件: ${file.name}` : uploadAreaDragActive ? "松开以上传文件" : "上传图片或文件（可拖拽）"}
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {imagePreviewURL && (
                  <div className="w-full flex justify-center relative">
                    <img
                      src={imagePreviewURL}
                      alt="预览"
                      className="mt-2 max-h-40 rounded border object-contain"
                    />
                    {/* 撤回上传按钮 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleFileSelect(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute top-2 right-2 p-1 rounded-full bg-white border shadow hover:bg-slate-100"
                      aria-label="删除已上传文件"
                      title="删除已上传文件"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {file && !image && (
                  <div className="w-full flex justify-center relative mt-2">
                    <div className="px-3 py-2 bg-slate-50 rounded border text-sm text-slate-700">
                      {file.name}
                    </div>
                    {/* 撤回上传按钮 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleFileSelect(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute top-2 right-2 p-1 rounded-full bg-white border shadow hover:bg-slate-100"
                      aria-label="删除已上传文件"
                      title="删除已上传文件"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </label>

              {/* SMILES 输入 + 画布 */}
              <label className="text-lg font-semibold text-center flex items-center justify-center gap-2 text-purple-600">
                <span>⚗️</span>
                <span>SMILES 可视化</span>
              </label>
              <div className="flex gap-2">
                <input
                  value={smiles}
                  onChange={(e) => setSmiles(e.target.value)}
                  className="flex-1 p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-inset focus:border-green-500"
                  placeholder="CCO 或 c1ccccc1"
                  aria-label="SMILES 输入"
                />
                <button
                  type="button"
                  onClick={() => setSmiles("")}
                  className="px-3 py-2 rounded-md border hover:bg-slate-50"
                  title="清空 SMILES"
                  aria-label="清空 SMILES"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="w-full flex justify-center items-center">
                <div className="w-[90vw] max-w-[380px] bg-slate-50 border rounded-lg flex justify-center items-center h-[260px] overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain"
                    aria-label="SMILES 绘制画布"
                  />
                </div>
              </div>
              {smilesError && (
                <div className="text-xs text-red-600">{smilesError}</div>
              )}

              {/* Reset / Copy / .md / Export */}
              <div className="mt-1">
                <small className="text-sm text-slate-400">
                  历史记录保存在本地
                </small>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleReset}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-3 py-2 text-sm bg-white hover:bg-gradient-to-r hover:from-slate-50 hover:to-indigo-50 hover:border-indigo-400 shadow-sm hover:shadow-md active:shadow-none transition-all btn-animated"
                    title="重置"
                    aria-label="重置"
                  >
                    <RefreshCw size={14} /> Reset
                  </button>
                  <button
                    onClick={handleCopyAnswer}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-3 py-2 text-sm bg-white hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 hover:border-indigo-400 shadow-sm hover:shadow-md active:shadow-none transition-all btn-animated"
                    title="复制答案"
                    aria-label="复制答案"
                  >
                    <Copy size={14} /> Copy
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-3 py-2 text-sm bg-white hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 hover:border-purple-400 shadow-sm hover:shadow-md active:shadow-none transition-all btn-animated"
                    title="下载 Markdown"
                    aria-label="下载 Markdown"
                  >
                    <Download size={14} /> .md
                  </button>
                  <button
                    onClick={handleExport}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-3 py-2 text-sm bg-white hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 hover:border-cyan-400 shadow-sm hover:shadow-md active:shadow-none transition-all btn-animated"
                    title="导出/打印"
                    aria-label="导出/打印"
                  >
                    <Printer size={14} /> Export
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* 右侧：答案 + 历史（固定高度 + 内部滚动；内容左对齐，标题居中） */}
          <section className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 答案卡片 */}
            <div className={`bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-100 flex flex-col overflow-hidden card-hover ${PANEL_H}`}>
              <motion.h2 className="text-lg font-semibold mb-3 text-center flex items-center justify-center gap-2 text-blue-600">
                <span>🤖</span>
                <span>AI 回答</span>
              </motion.h2>

              {!answer && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="text-6xl mb-4">🔬</div>
                  <div className="text-sm text-slate-600 font-medium mb-2">
                    等待你的问题
                  </div>
                  <div className="text-xs text-slate-400">
                    提交问题后，系统会在此展示答案
                  </div>
                </div>
              )}
              {loading && (
                <div className="py-2 text-center">
                  <AnimatedLoader label="系统正在检索答案…" />
                </div>
              )}
              {answer && (
                <div
                  ref={answerRef}
                  className="whitespace-pre-wrap text-sm flex-1 overflow-y-auto pr-1 leading-6"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code({ inline, className, children, ...props }) {
                        return inline ? (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        ) : (
                          <pre
                            className="rounded p-2 bg-slate-100 overflow-auto"
                            {...props}
                          >
                            <code>{children}</code>
                          </pre>
                        );
                      },
                    }}
                  >
                    {preprocessMathDelimiters(answer.text || "")}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* 历史卡片 */}
            <div className={`bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-100 flex flex-col overflow-hidden card-hover ${PANEL_H}`}>
              <h3 className="text-lg font-semibold mb-3 text-center flex items-center justify-center gap-2 text-green-600">
                <span>📚</span>
                <span>历史 & 快速复用</span>
              </h3>
              <input
                type="text"
                placeholder="🔍 搜索历史..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="mb-2 w-full p-2 border-2 border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 input-focus transition-all"
                aria-label="搜索历史"
              />
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="text-5xl mb-3">📝</div>
                  <div className="text-sm text-slate-500 font-medium">暂无历史记录</div>
                  <div className="text-xs text-slate-400 mt-1">开始提问后，历史记录将显示在这里</div>
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
                {history
                  .filter(
                    (h) =>
                      (h.query || "")
                        .toLowerCase()
                        .includes(historySearch.toLowerCase()) ||
                      (h.text || "")
                        .toLowerCase()
                        .includes(historySearch.toLowerCase())
                  )
                  .map((h, idx) => (
                    <div
                      key={h.localTs || h.id || idx}
                      className="p-3 rounded-lg border-2 border-slate-200 hover:border-indigo-300 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all card-hover"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="text-sm font-medium">
                          {(h.query || "").slice(0, 80) || "（无问题标题）"}
                        </div>
                        <div className="text-xs text-slate-400 whitespace-nowrap">
                          {formatDate(h.localTs || h.id)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 mt-2">
                        {(h.text || "").slice(0, 160)}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="px-2 py-1 text-xs border-2 border-indigo-200 rounded-md hover:bg-indigo-100 hover:border-indigo-300 text-indigo-700 transition-all"
                          onClick={() => {
                            setQuestion(h.query || "");
                            setAnswer(h);
                          }}
                        >
                          Load
                        </button>
                        <button
                          className="px-2 py-1 text-xs border-2 border-purple-200 rounded-md hover:bg-purple-100 hover:border-purple-300 text-purple-700 transition-all"
                          onClick={() =>
                            navigator.clipboard?.writeText(h.text || "")
                          }
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </main>

        {/* 反馈 */}
        <section className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-100 flex flex-col gap-3 card-hover">
          <h3 className="text-lg font-semibold text-center flex items-center justify-center gap-2 text-orange-600">
            <span>💬</span>
            <span>发送反馈</span>
          </h3>
          <textarea
            rows={3}
            placeholder="💭 告诉我们你的问题或建议..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full p-3 border-2 border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 input-focus transition-all"
          />
          <div className="flex justify-end">
            <button
              onClick={handleFeedback}
              disabled={sending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 btn-animated shadow-md hover:shadow-lg transition-all"
            >
              <BiSend size={14} />
              {sending ? (
                <span className="flex items-center gap-2">
                  <span>正在发送</span>
                  <span className="loading-dots">
                    <span></span><span></span><span></span>
                  </span>
                </span>
              ) : (
                "发送反馈"
              )}
            </button>
          </div>
          {feedbackMsg && (
            <div
              className={`text-sm ${
                feedbackMsg.startsWith("✅")
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {feedbackMsg}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-400 space-y-1">
          <div>
            <a
              href="https://github.com/doralyyyyy/OrganicChem-AI"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              GitHub 项目地址
            </a>
          </div>
          <div>by 24 化院 张嵩仁 楼晟铭 周楚越</div>
        </footer>
      </div>

      {/* 文档管理：全屏弹层 */}
      {docMgrOpen && (
        <DocumentManager
          onClose={() => setDocMgrOpen(false)}
          onUploadChapter={async (file, chapterId) => {
            setUploading(true);
            setUploadMsg(`正在上传 ${file.name} ...`);
            try {
              const formData = new FormData();
              formData.append("file", file);
              formData.append("chapter_id", chapterId);
              const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/ingest`, {
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
                setUploadMsg(`✅ 已导入 ${data.filename}，分块数 ${data.totalChunks}`);
              } else {
                setUploadMsg(`❌ 失败: ${data.message || "未知错误"}`);
              }
            } catch (err) {
              setUploadMsg(`❌ 错误: ${err.message}`);
            } finally {
              setUploading(false);
            }
          }}
        />
      )}

      {/* 登录注册弹层 */}
      {showAuth && (
        <Auth
          onClose={() => setShowAuth(false)}
          onLogin={handleLogin}
        />
      )}

      {/* 结构式绘制选择弹层 */}
      {showChemDrawSelector && (
        <ChemDrawSelector onClose={() => setShowChemDrawSelector(false)} />
      )}
    </div>
  );
}

export default App;
