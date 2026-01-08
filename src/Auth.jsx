import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, Mail, Lock, User, Send, CheckCircle, AlertCircle } from "lucide-react";

const API = import.meta.env.VITE_API_BASE;

function Auth({ onClose, onLogin }) {
  const [mode, setMode] = useState("login"); // 'login' | 'register' | 'login-code'
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false); // 发送验证码的独立加载状态
  const [message, setMessage] = useState({ type: "", text: "" });
  const [countdown, setCountdown] = useState(0);

  // 注册表单
  const [registerForm, setRegisterForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    code: "",
  });

  // 登录表单（密码方式）
  const [loginForm, setLoginForm] = useState({
    account: "",
    password: "",
  });

  // 登录表单（验证码方式）
  const [loginCodeForm, setLoginCodeForm] = useState({
    email: "",
    code: "",
  });

  // 发送验证码
  async function handleSendCode(email, type) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: "error", text: "请输入有效的邮箱地址" });
      return;
    }

    setSendingCode(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`${API}/api/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "验证码已发送到您的邮箱" });
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setMessage({ type: "error", text: data.message || "发送失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "网络错误" });
    } finally {
      setSendingCode(false);
    }
  }

  // 注册
  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("user_info", JSON.stringify(data.user));
        onLogin(data.user, data.token);
        onClose();
      } else {
        setMessage({ type: "error", text: data.message || "注册失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  // 登录（密码）
  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("user_info", JSON.stringify(data.user));
        onLogin(data.user, data.token);
        onClose();
      } else {
        setMessage({ type: "error", text: data.message || "登录失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  // 登录（验证码）
  async function handleLoginCode(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch(`${API}/api/auth/login-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginCodeForm),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("user_info", JSON.stringify(data.user));
        onLogin(data.user, data.token);
        onClose();
      } else {
        setMessage({ type: "error", text: data.message || "登录失败" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-white">
          <h2 className="text-xl font-semibold text-slate-800">
            {mode === "register" ? "注册账号" : mode === "login-code" ? "验证码登录" : "登录账号"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-slate-100"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 sm:p-6">
          {/* 消息提示 */}
          {message.text && (
            <div
              className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
                message.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}
            >
              {message.type === "error" ? (
                <AlertCircle size={16} />
              ) : (
                <CheckCircle size={16} />
              )}
              {message.text}
            </div>
          )}

          {/* 注册表单 */}
          {mode === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  用户名
                </label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={registerForm.username}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, username: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="3-20个字符"
                    required
                    minLength={3}
                    maxLength={20}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  邮箱
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  密码
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    value={registerForm.password}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, password: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="至少6个字符"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  确认密码
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    value={registerForm.confirmPassword}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, confirmPassword: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="再次输入密码"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  邮箱验证码
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={registerForm.code}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, code: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="6位验证码"
                      required
                      maxLength={6}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendCode(registerForm.email, "register")}
                    disabled={sendingCode || countdown > 0 || !registerForm.email}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 whitespace-nowrap"
                  >
                    <Send size={14} />
                    {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}秒` : "发送验证码"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {loading ? "注册中..." : "注册"}
              </button>
            </form>
          )}

          {/* 登录表单（密码） */}
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  账号或邮箱
                </label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={loginForm.account}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, account: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="用户名或邮箱"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  密码
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="请输入密码"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          )}

          {/* 登录表单（验证码） */}
          {mode === "login-code" && (
            <form onSubmit={handleLoginCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  邮箱
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="email"
                    value={loginCodeForm.email}
                    onChange={(e) =>
                      setLoginCodeForm({ ...loginCodeForm, email: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  验证码
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={loginCodeForm.code}
                      onChange={(e) =>
                        setLoginCodeForm({ ...loginCodeForm, code: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="6位验证码"
                      required
                      maxLength={6}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendCode(loginCodeForm.email, "login")}
                    disabled={sendingCode || countdown > 0 || !loginCodeForm.email}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 whitespace-nowrap"
                  >
                    <Send size={14} />
                    {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}秒` : "发送验证码"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          )}

          {/* 切换模式 */}
          <div className="mt-6 pt-4 border-t text-center space-y-2">
            {mode === "login" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("login-code")}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  使用验证码登录
                </button>
                <div className="text-sm text-slate-600">
                  还没有账号？{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    立即注册
                  </button>
                </div>
              </>
            )}
            {mode === "login-code" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  使用密码登录
                </button>
                <div className="text-sm text-slate-600">
                  还没有账号？{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    立即注册
                  </button>
                </div>
              </>
            )}
            {mode === "register" && (
              <div className="text-sm text-slate-600">
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-indigo-600 hover:underline font-medium"
                >
                  立即登录
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default Auth;
