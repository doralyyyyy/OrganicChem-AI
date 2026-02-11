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
  PenTool,
  ExternalLink
} from "lucide-react";
import Auth from "./Auth.jsx";
import ChemDrawSelector from "./ChemDrawSelector.jsx";
import DocumentManager from "./DocumentManager.jsx";
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
const PANEL_H = "h-[115vh] sm:h-[110vh] md:h-[95vh]"; // 左侧卡片固定高度

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

// 文档管理器已迁移至 DocumentManager.jsx

// 主函数
function App() {
  const [question, setQuestion] = useState("");
  const [smiles, setSmiles] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [image, setImage] = useState(null);
  const [file, setFile] = useState(null);
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
  const [inputDragActive, setInputDragActive] = useState(false);
  const [uploadAreaDragActive, setUploadAreaDragActive] = useState(false);
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

  const fileInputRef = useRef(null);

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
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);

  const requestControllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const [smilesLibReady, setSmilesLibReady] = useState(
    typeof window !== "undefined" && !!window.SmilesDrawer
  );

  // Session ID 处理
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

  // 未登录用户保存历史记录到 localStorage
  useEffect(() => {
    if (!user) {
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

  // SMILES Drawer 动态加载
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

  // 图片预览
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

  // 上传文档
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

  // 语音输入
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

  // 处理文件选择
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

    // 1) 直接从剪贴板的 file/items 里找图片
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

    // 2) 从 HTML 里找 <img src="..."> 并抓取
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

  // 提交 / 取消
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

  // 导出 / 复制 / 下载
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
  function handleViewHTML() {
    const w = window.open("", "_blank");
    if (!w) return alert("Allow popups to view HTML");

    const rendered = answerRef.current
      ? answerRef.current.innerHTML
      : `<pre>${escapeHtml(answer?.text || "")}</pre>`;
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Answer Preview</title>
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

  // 清空历史
  async function handleClearHistory() {
    setShowClearHistoryConfirm(false);
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

  function parseHistoryChatId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async function handleDeleteHistoryItem(item) {
    const confirmed = window.confirm("确定删除这条历史记录吗？");
    if (!confirmed) return;

    const explicitUserChatId = parseHistoryChatId(item?.userChatId);
    const legacyId = parseHistoryChatId(item?.id);
    const legacyUserChatId = legacyId && legacyId < 1e11 ? legacyId : null;
    const userChatId = explicitUserChatId ?? legacyUserChatId;
    const assistantChatId = parseHistoryChatId(item?.assistantChatId);

    if (userChatId || assistantChatId) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/history/item`, {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            session_id,
            userChatId,
            assistantChatId,
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data?.ok || !data?.deleted) {
          alert(`删除失败：${data?.message || "未知错误"}`);
          return;
        }
      } catch (err) {
        alert(`删除失败：${err.message || "网络错误"}`);
        return;
      }
    }

    setHistory((cur) => cur.filter((h) => h !== item));
  }

  // 反馈
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

  // SMILES 渲染
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
  }, []);

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
                    onClick={() => setShowClearHistoryConfirm(true)}
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
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  value={smiles}
                  onChange={(e) => setSmiles(e.target.value)}
                  className="flex-1 min-w-0 p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-inset focus:border-green-500"
                  placeholder="CCO 或 c1ccccc1"
                  aria-label="SMILES 输入"
                />
                <button
                  type="button"
                  onClick={() => window.open(`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(smiles.trim())}&input_type=smiles`, "_blank", "noopener,noreferrer")}
                  disabled={!smiles.trim() || !!smilesError}
                  className="px-3 py-3 rounded-md border hover:bg-slate-50 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={smiles.trim() && !smilesError ? "在 PubChem 中查看物化性质、谱学信息等" : "请输入正确的 SMILES 式后可点击"}
                  aria-label="查看化合物详情"
                >
                  <Search size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setSmiles("")}
                  className="px-3 py-3 rounded-md border hover:bg-slate-50 shrink-0"
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
                <>
                  {answer.text !== "已取消请求。" && (
                    <div className="flex justify-end mb-2 flex-shrink-0">
                      <button
                        onClick={handleViewHTML}
                        type="button"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 hover:border-cyan-400 shadow-sm hover:shadow-md active:shadow-none transition-all"
                        title="在新窗口打开HTML版本"
                        aria-label="在新窗口打开HTML版本"
                      >
                        <ExternalLink size={12} /> 放大查看
                      </button>
                    </div>
                  )}
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
                </>
              )}
            </div>

            {/* 历史卡片 */}
            <div className={`bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-indigo-100 flex flex-col card-hover ${PANEL_H}`}>
              <h3 className="text-lg font-semibold mb-3 text-center flex items-center justify-center gap-2 text-green-600 flex-shrink-0">
                <span>📚</span>
                <span>历史 & 快速复用</span>
              </h3>
              <input
                type="text"
                placeholder="🔍 搜索历史..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="mb-2 w-full p-2 border-2 border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 input-focus transition-all flex-shrink-0"
                aria-label="搜索历史"
              />
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 text-center py-8">
                  <div className="text-5xl mb-3">📝</div>
                  <div className="text-sm text-slate-500 font-medium">暂无历史记录</div>
                  <div className="text-xs text-slate-400 mt-1">开始提问后，历史记录将显示在这里</div>
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1 min-h-0 overflow-x-hidden">
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
                      key={h.userChatId || h.assistantChatId || h.localTs || h.id || idx}
                      className="p-3 rounded-lg border-2 border-slate-200 hover:border-indigo-300 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all card-hover flex flex-col gap-2 flex-shrink-0"
                    >
                      <div className="flex justify-between items-start gap-3 min-w-0">
                        <div className="text-sm font-medium flex-1 min-w-0 break-words">
                          {(h.query || "").slice(0, 80) || "（无问题标题）"}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {formatDate(h.localTs || h.id)}
                          </div>
                          <button
                            className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            aria-label="删除该条历史"
                            title="删除该条历史"
                            onClick={() => handleDeleteHistoryItem(h)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 line-clamp-3 break-words">
                        {(h.text || "").slice(0, 160)}
                      </div>
                      <div className="mt-auto flex gap-2 flex-shrink-0">
                        <button
                          className="px-2 py-1 text-xs border-2 border-indigo-200 rounded-md hover:bg-indigo-100 hover:border-indigo-300 text-indigo-700 transition-all whitespace-nowrap"
                          onClick={() => {
                            setQuestion(h.query || "");
                            setAnswer(h);
                          }}
                        >
                          Load
                        </button>
                        <button
                          className="px-2 py-1 text-xs border-2 border-purple-200 rounded-md hover:bg-purple-100 hover:border-purple-300 text-purple-700 transition-all whitespace-nowrap"
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

      {/* 清除历史确认弹窗 */}
      {showClearHistoryConfirm && (
        <div className="fixed inset-0 z-[102] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border-2 border-green-100 p-6 max-w-md w-full"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-700">
              <span>🗑️</span>
              <span>是否清除所有聊天历史？</span>
            </h3>
            <p className="text-sm text-slate-600 mb-6">清除后无法恢复，请确认后再操作。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearHistoryConfirm(false)}
                className="px-4 py-2 border rounded-md hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleClearHistory}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                确认清除
              </button>
            </div>
          </motion.div>
        </div>
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
