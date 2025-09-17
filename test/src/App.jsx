import './App.css';
import { useEffect, useRef, useState } from "react";
import { Send, RefreshCw, Printer } from "lucide-react";
import { motion } from "framer-motion";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // KaTeX 样式，用于页面内渲染

function App() {
    const [question, setQuestion] = useState("");
    const [smiles, setSmiles] = useState("");
    const [answer, setAnswer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("oc_history_v1")) || [];
        } catch {
            return [];
        }
    });
    const canvasRef = useRef(null);
    const answerRef = useRef(null); // 渲染后的答案容器的 ref（用于导出打印）

    const [uploading, setUploading] = useState(false);
    const [uploadMsg, setUploadMsg] = useState("");

    // 上传函数
    async function handleUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadMsg(`正在上传 ${file.name} ...`);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const resp = await fetch("http://localhost:3001/api/ingest", {
                method: "POST",
                body: formData
            });

            const data = await resp.json();
            if (data.ok) {
                setUploadMsg(`✅ 已导入 ${data.filename}，分块数 ${data.totalChunks}`);
            } else {
                setUploadMsg(`❌ 失败: ${data.message}`);
            }
        } catch (err) {
            setUploadMsg(`❌ 错误: ${err.message}`);
        } finally {
            setUploading(false);
        }
    }

    useEffect(() => {
        localStorage.setItem("oc_history_v1", JSON.stringify(history));
    }, [history]);

    // 生成或加载 session_id
    const [session_id] = useState(() => {
        let sid = localStorage.getItem("oc_session_id");
        if (!sid) {
            sid = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
            localStorage.setItem("oc_session_id", sid);
        }
        return sid;
    });

    // SMILES 渲染
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!smiles) return;

        try {
            const smilesDrawer = new SmilesDrawer.Drawer({ width: 360, height: 220 });
            SmilesDrawer.parse(smiles, function(tree) {
                smilesDrawer.draw(tree, canvas, "light", false);
            });
        } catch (err) {
            console.error("SMILES 绘制失败:", err);
        }
    }, [smiles]);

    // 把 \[...\] / \(...\) 等 LaTeX 定界符转换成常见的 $$...$$ / $...$（便于 remark-math 识别）
    function preprocessMathDelimiters(s = "") {
        if (!s) return "";
        // \[ ... \] -> $$ ... $$
        s = s.replace(/\\\[(.*?)\\\]/gs, (_, g1) => `$$${g1}$$`);
        // \( ... \) -> $ ... $
        s = s.replace(/\\\((.*?)\\\)/gs, (_, g1) => `$${g1}$`);
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

    async function handleSubmit(e) {
        e?.preventDefault();
        if (!question.trim()) return;
        setLoading(true);
        setAnswer(null);

        try {
            const resp = await fetch("http://localhost:3001/api/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question, session_id })
            });

            // 先拿 raw 文本便于调试（可以改回 resp.json()）
            const raw = await resp.text();
            // 尝试解析 JSON，若后端返回了错误页会走到 catch
            const data = JSON.parse(raw);

            setAnswer(data);
            setHistory((h) => [data, ...h].slice(0, 50));
        } catch (err) {
            setAnswer({ text: `Error: ${err.message}`, sources: [] });
        } finally {
            setLoading(false);
        }
    }

    // 导出 / 打印：直接把渲染后的 DOM（answerRef.innerHTML）写入新窗口并打印
    function handleExport() {
        const w = window.open("", "_blank");
        if (!w) return alert("Allow popups to export");

        // 获取渲染后的 HTML（innerHTML 已含 KaTeX 渲染后的标签）
        const rendered = answerRef.current ? answerRef.current.innerHTML : `<pre>${escapeHtml(answer?.text || "")}</pre>`;

        const html = `<!doctype html>
        <html>
        <head>
        <meta charset="utf-8">
        <title>Export</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.7/dist/katex.min.css">
        <style>
        body{font-family:Arial, Helvetica, sans-serif; padding:20px; color:#111;}
        pre{white-space:pre-wrap; word-break:break-word; background:#fafafa; padding:8px; border-radius:6px;}
        h1{font-size:20px;}
        h2{font-size:16px; margin-top:18px;}
        .katex .katex-mathml { display: none; }
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
        w.focus();
        w.print();
    }

    async function handleClearHistory() {
        setHistory([]);
        localStorage.removeItem("oc_history_v1");
        try {
            const resp = await fetch("http://localhost:3001/api/clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id }) 
            });
            const data = await resp.json();
            if (data.ok) {
                console.log("✅ 已清空对话", data.deleted, "条");
            } else {
                console.error("❌ 清空失败:", data.message);
            }
        } catch (err) {
            console.error("请求错误:", err);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-6 flex justify-center">
            <div className="max-w-6xl w-full space-y-6">
                <motion.header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className='ml-6'>
                        <h1 className="text-3xl font-bold">OrganicChem AI 助教</h1>
                        <br />
                        <p className="text-sm text-slate-500">交互式教学 | 可视化分子 | 可追溯的知识单元</p>
                    </div>
                    <div className="flex gap-3 items-center">
                        <button onClick={() => { setQuestion(""); setAnswer(null); setSmiles(""); }}
                            className="px-3 py-2 rounded-lg border flex items-center gap-2"><RefreshCw size={14} /> Reset</button>
                    </div>
                </motion.header>

                <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <section className="md:col-span-1 bg-white p-4 rounded-2xl shadow-md flex flex-col gap-4">
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <label className="text-lg font-semibold">输入你的问题</label>
                            <textarea rows={6} value={question} onChange={(e) => setQuestion(e.target.value)}
                                style={{ width: "400px", maxWidth: "100%" }} className="p-3 border rounded-md text-sm resize-none"
                                placeholder="例如：解释 SN1 反应的机理..." />
                            <div className="flex gap-2">
                                <button type="submit"
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
                                    <Send size={16} /> {loading ? "正在分析..." : "提交问题"}
                                </button>
                                <button type="button" onClick={() => setQuestion(q => q + "\n请给出举例说明")}
                                    className="px-3 py-2 rounded-xl border">示例扩写</button>
                            </div>

                            <label className="text-lg font-semibold">SMILES 可视化</label>
                            <div className="flex gap-2">
                                <input
                                    value={smiles}
                                    onChange={(e) => setSmiles(e.target.value)}
                                    className="flex-1 p-2 border rounded-md text-sm"
                                    placeholder="CCO 或 c1ccccc1"
                                />
                            </div>
                            <div className="mt-2 w-full bg-slate-50 border rounded-lg flex items-center justify-center" style={{ height: '250px' }}>
                                <canvas ref={canvasRef} width={360} height={250} className="mt-2" />
                            </div>
                            <div className="flex justify-between items-center mt-4">
                                <small className="text-sm text-slate-400">历史记录保存在本地</small>
                                <div className="flex gap-2">
                                    <button onClick={handleClearHistory} type="button" className="px-3 py-2 border rounded-md">Clear</button>
                                    <button onClick={handleExport} type="button" className="px-3 py-2 border rounded-md flex items-center gap-2">
                                        <Printer size={14} /> Export
                                    </button>
                                </div>
                            </div>
                        </form>
                    </section>

                    <section className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6 h-[730px]">
                        <div className="bg-white p-4 rounded-2xl shadow-md flex flex-col" style={{ height: "730px" }}>
                            <motion.h2 className="text-lg font-semibold mb-3">
                                AI 回答
                            </motion.h2>
                            {!answer && !loading && <div className="text-sm text-slate-500">提交问题后，系统会在此展示答案。</div>}
                            {loading && <div className="py-8 text-center text-sm text-slate-500">系统正在检索答案…</div>}
                            {answer && (
                                <div ref={answerRef} className="whitespace-pre-wrap text-sm flex-1 overflow-auto">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            code({ node, inline, className, children, ...props }) {
                                                return inline ? (
                                                    <code className={className} {...props}>{children}</code>
                                                ) : (
                                                    <pre className="rounded p-2 bg-slate-100" {...props}><code>{children}</code></pre>
                                                );
                                            }
                                        }}
                                    >
                                        {preprocessMathDelimiters(answer.text || "")}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-md flex flex-col h-[730px]">
                            <h3 className="text-lg font-semibold mb-3">历史 & 快速复用</h3>
                            {history.length === 0 && <div className="text-sm text-slate-400">暂无历史</div>}
                            <div className="flex-1 flex flex-col gap-2 overflow-auto">
                                {history.map((h, idx) => (
                                    <div key={h.id || idx} className="p-3 rounded-md border hover:bg-slate-50">
                                        <div className="flex justify-between items-start">
                                            <div className="text-sm font-medium">{h.query?.slice(0, 80)}</div>
                                            <div className="text-xs text-slate-400">{new Date(h.id).toLocaleString()}</div>
                                        </div>
                                        <div className="text-xs text-slate-600 mt-2">{(h.text || "").slice(0, 160)}</div>
                                        <div className="mt-3 flex gap-2">
                                            <button className="px-2 py-1 text-xs border rounded"
                                                onClick={() => { setQuestion(h.query); setAnswer(h); }}>Load</button>
                                            <button className="px-2 py-1 text-xs border rounded"
                                                onClick={() => navigator.clipboard?.writeText(h.text || "")}>Copy</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </main>
                <label className="text-lg font-semibold">上传教材/题库</label>
                    <input type="file" onChange={handleUpload} className="text-sm" />
                    {uploading && <div className="text-xs text-slate-500">{uploadMsg}</div>}
                    {!uploading && uploadMsg && <div className="text-xs text-green-600">{uploadMsg}</div>}
                <footer className="mt-8 text-center text-xs text-slate-400">by 24 化院 张嵩仁</footer>
            </div>
        </div>
    );
}

export default App;
