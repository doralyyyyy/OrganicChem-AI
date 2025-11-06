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
  Upload,
  Mic,
  Paperclip,
  StopCircle,
  Copy,
  Download,
  X
} from "lucide-react";
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

// —— 高级感化学主题加载动画 ——
// 支持优先使用 /anim/ai-loader.gif（若存在），否则回退到内联 SVG 动画
function AnimatedLoader({ label = "系统正在检索答案…", size = 160, imgSrc = "/anim/ai-loader.gif" }) {
  const [useImg, setUseImg] = React.useState(true);
  return (
    <div className="flex flex-col items-center gap-3 py-4 select-none">
      {useImg ? (
        <img
          src={imgSrc}
          alt="AI 正在思考"
          width={size}
          height={size}
          className="oc-loader rounded-xl ring-1 ring-slate-200 shadow-sm object-contain pointer-events-none"
          onError={() => setUseImg(false)}
        />
      ) : (
        <div className="oc-loader" role="img" aria-label="AI 正在思考的动画">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <linearGradient id="ocGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#10b981" /> {/* emerald-500 */}
                <stop offset="55%"  stopColor="#60a5fa" /> {/* blue-400 */}
                <stop offset="100%" stopColor="#a78bfa" /> {/* violet-400 */}
              </linearGradient>
              <filter id="ocGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.8" result="blur"/>
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
                strokeWidth="2"
              />
              <circle className="oc-dot d1" cx="60" cy="28" r="2" />
              <circle className="oc-dot d2" cx="84" cy="42" r="2" />
              <circle className="oc-dot d3" cx="84" cy="72" r="2" />
              <circle className="oc-dot d4" cx="60" cy="86" r="2" />
              <circle className="oc-dot d5" cx="36" cy="72" r="2" />
              <circle className="oc-dot d6" cx="36" cy="42" r="2" />
            </g>
          </svg>
        </div>
      )}
      <div className="text-sm text-slate-500">{label}</div>
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
  const [smilesError, setSmilesError] = useState("");

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

  // Abort controller
  const requestControllerRef = useRef(null);
  // speech
  const recognitionRef = useRef(null);
  // smiles-drawer readiness
  const [smilesLibReady, setSmilesLibReady] = useState(
    typeof window !== "undefined" && !!window.SmilesDrawer
  );

  // session id
  const [session_id] = useState(() => {
    let sid = localStorage.getItem("oc_session_id");
    if (!sid) {
      sid =
        "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("oc_session_id", sid);
    }
    return sid;
  });

  useEffect(() => {
    localStorage.setItem("oc_history_v1", JSON.stringify(history));
  }, [history]);

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
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!allowedDocTypes.includes(file.type)) {
        setUploadMsg("❌ 仅支持上传 PDF、Word、TXT 文件");
        return;
      }
      const fakeEvent = { target: { files: [file] } };
      handleUpload(fakeEvent);
    }
  };

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

        setImage(file);
        // 为了能再次选择/粘贴同名文件，清空原 <input type="file"> 的值
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      // 不阻止默认行为，这样若同时有文本也会正常粘贴
      return;
    }

    // 2) 兜底：有些来源复制的是含 <img> 的 HTML（无直接文件）
    //    尝试解析出 <img src="..."> 的链接并抓取为 Blob（受 CORS 限制）
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

              setImage(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            })
            .catch(() => {
              // 忽略：可能被 CORS 拒绝
            });
        }
      } catch {
        // 忽略解析异常
      }
    }
  }

  // submit / cancel
  async function handleSubmit(e) {
    e?.preventDefault();
    if (!question.trim() && !image) return;

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
      if (image) formData.append("image", image);

      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/solve`, {
        method: "POST",
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
      const resp = await fetch(`${import.meta.env.VITE_API_BASE}/api/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  // smiles draw (dpr + debounce)
  const drawSmiles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const dpr = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    if (!smiles) {
      setSmilesError("");
      return;
    }

    if (!window.SmilesDrawer) {
      setSmilesError("未找到 SmilesDrawer（已尝试自动加载）。");
      return;
    }

    setSmilesError("");
    try {
      const drawer = new window.SmilesDrawer.Drawer({
        width: size,
        height: size,
      });
      window.SmilesDrawer.parse(
        smiles,
        function (tree) {
          drawer.draw(tree, canvas, "light", false);
        },
        function (err) {
          console.error("SMILES 解析失败:", err);
          setSmilesError("SMILES 解析失败，请检查格式。");
        }
      );
    } catch (err) {
      console.error("SMILES 绘制失败:", err);
      setSmilesError("SMILES 绘制失败。");
    }
  }, [smiles]);
  const smilesDebounceRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    if (smilesDebounceRef.current) clearTimeout(smilesDebounceRef.current);
    smilesDebounceRef.current = setTimeout(drawSmiles, 160);
    return () => clearTimeout(smilesDebounceRef.current);
  }, [smiles, smilesLibReady, drawSmiles]);

  // UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-3 sm:p-6 flex justify-center text-center">
      <div className="w-full max-w-6xl space-y-6">
        {/* Header */}
        <motion.header
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="ml-1 sm:ml-3">
            <h1 className="text-3xl font-bold">OrganicChem AI助教</h1>
            <p className="mt-2 text-sm text-slate-500">
              交互式教学 · 可视化分子 · 可追溯知识单元
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={handleClearHistory}
              type="button"
              className="px-3 py-2 rounded-lg bg-green-600 text-white flex items-center gap-2 hover:bg-green-700"
              aria-label="清空历史"
              title="清空历史"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </motion.header>

        {/* Main */}
        <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左侧：输入区 —— 固定高度 + 内部滚动；内容默认左对齐，标题单独居中 */}
          <section className={`md:col-span-1 bg-white p-4 rounded-2xl shadow-md flex flex-col gap-4 overflow-hidden ${PANEL_H}`}>
            <form className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1" onSubmit={handleSubmit}>
              {/* 标题居中 */}
              <label className="text-lg font-semibold text-center">输入你的问题</label>

              <div className="relative">
                <textarea
                  rows={6}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onPaste={handlePasteToTextarea}
                  className="w-full p-3 border rounded-md text-sm resize-none pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset focus:border-blue-500"
                  placeholder="例如：解释 SN1 反应的机理..."
                  aria-label="问题输入"
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
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60"
                  aria-label="提交问题"
                  title="提交问题"
                >
                  <Send size={16} /> {loading ? "正在分析..." : "提交问题"}
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

              {/* 上传图片（题图/结构式） */}
              <label className="flex flex-col items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-green-500 hover:bg-green-50 transition">
                <div className="flex items-center gap-2">
                  <Paperclip size={18} className="text-green-600" />
                  <span className="text-slate-600">
                    {image ? `已选择: ${image.name}` : "上传图片（可选）"}
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImage(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {imagePreviewURL && (
                  <div className="w-full flex justify-center relative">
                    <img
                      src={imagePreviewURL}
                      alt="预览"
                      className="mt-2 max-h-40 rounded border object-contain"
                    />
                    {/* 撤回上传按钮 —— 阻止冒泡并重置 input 值 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setImage(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute top-2 right-2 p-1 rounded-full bg-white border shadow hover:bg-slate-100"
                      aria-label="删除已上传图片"
                      title="删除已上传图片"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </label>

              {/* SMILES 输入 + 画布 */}
              <label className="text-lg font-semibold text-center">SMILES 可视化</label>
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

              {/* Reset / Copy / .md / Export —— 响应式美化排列 */}
              <div className="mt-1">
                <small className="text-sm text-slate-400">
                  历史记录保存在本地
                </small>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleReset}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white hover:bg-slate-50 shadow-sm active:shadow-none transition"
                    title="重置"
                    aria-label="重置"
                  >
                    <RefreshCw size={14} /> Reset
                  </button>
                  <button
                    onClick={handleCopyAnswer}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white hover:bg-slate-50 shadow-sm active:shadow-none transition"
                    title="复制答案"
                    aria-label="复制答案"
                  >
                    <Copy size={14} /> Copy
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white hover:bg-slate-50 shadow-sm active:shadow-none transition"
                    title="下载 Markdown"
                    aria-label="下载 Markdown"
                  >
                    <Download size={14} /> .md
                  </button>
                  <button
                    onClick={handleExport}
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white hover:bg-slate-50 shadow-sm active:shadow-none transition"
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
            <div className={`bg-white p-4 rounded-2xl shadow-md flex flex-col overflow-hidden ${PANEL_H}`}>
              <motion.h2 className="text-lg font-semibold mb-3 text-center">
                AI 回答
              </motion.h2>

              {!answer && !loading && (
                <div className="text-sm text-slate-500">
                  提交问题后，系统会在此展示答案。
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
            <div className={`bg-white p-4 rounded-2xl shadow-md flex flex-col overflow-hidden ${PANEL_H}`}>
              <h3 className="text-lg font-semibold mb-3 text-center">历史 & 快速复用</h3>
              <input
                type="text"
                placeholder="搜索历史..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="mb-2 w-full p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-inset focus:border-slate-400"
                aria-label="搜索历史"
              />
              {history.length === 0 && (
                <div className="text-sm text-slate-400">暂无历史</div>
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
                      className="p-3 rounded-md border hover:bg-slate-50"
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
                          className="px-2 py-1 text-xs border rounded hover:bg-slate-100"
                          onClick={() => {
                            setQuestion(h.query || "");
                            setAnswer(h);
                          }}
                        >
                          Load
                        </button>
                        <button
                          className="px-2 py-1 text-xs border rounded hover:bg-slate-100"
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

        {/* 教材/题库上传区域*/}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`bg-white p-3 rounded-2xl shadow-md flex flex-col items-center justify-center border-2 border-dashed transition-colors cursor-pointer ${
            dragActive
              ? "border-green-400 bg-green-50"
              : "border-slate-300 hover:border-green-400 hover:bg-green-50"
          }`}
          aria-label="上传教材或题库"
        >
          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            <Upload size={20} className="text-green-600 mb-2" />
            <span className="text-lg font-semibold text-slate-700">
              上传教材/题库
            </span>
            <p className="text-xs text-slate-500 mt-1">
              拖拽文件到此处，或点击选择文件
            </p>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
          {uploading && (
            <div className="mt-2 text-xs text-slate-500">{uploadMsg}</div>
          )}
          {!uploading && uploadMsg && (
            <div className="mt-2 text-xs text-green-600">{uploadMsg}</div>
          )}
        </section>

        {/* 反馈 */}
        <section className="bg-white p-4 rounded-2xl shadow-md flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-center">发送反馈</h3>
          <textarea
            rows={3}
            placeholder="告诉我们你的问题或建议..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full p-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-inset focus:border-indigo-400"
          />
          <div className="flex justify-end">
            <button
              onClick={handleFeedback}
              disabled={sending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              <BiSend size={14} />
              {sending ? "正在发送..." : "发送反馈"}
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
    </div>
  );
}

export default App;
