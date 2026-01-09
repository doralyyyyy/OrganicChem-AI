import React from "react";
import { X, Zap, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

function ChemDrawSelector({ onClose }) {
  function handleSelect(url) {
    window.open(url, "_blank");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-white">
          <h2 className="text-xl font-semibold">选择结构式编辑器</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 mb-4">
            请选择您想要使用的化学结构式编辑器：
          </p>

          {/* 选项1：快速版（PubChem） */}
          <button
            onClick={() => handleSelect("https://pubchem.ncbi.nlm.nih.gov/edit3/index.html")}
            className="w-full p-5 border-2 border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
                <Zap size={24} className="text-orange-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-slate-800">PubChem</h3>
                  <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                    快速
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  来自PubChem的简洁编辑器，界面简单实用，适合快速绘制结构式并获取SMILES
                </p>
                <p className="text-xs text-slate-500">
                  <span className="font-medium">特点：</span>加载快速、操作简单、功能专注
                </p>
              </div>
            </div>
          </button>

          {/* 选项2：精美版（Ketcher） */}
          <button
            onClick={() => handleSelect("https://lifescience.opensource.epam.com/KetcherDemo/index.html")}
            className="w-full p-5 border-2 border-slate-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                <Sparkles size={24} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-slate-800">Ketcher</h3>
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                    精美
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  来自EPAM的现代化编辑器，界面精美，功能丰富，提供更好的用户体验
                </p>
                <p className="text-xs text-slate-500">
                  <span className="font-medium">特点：</span>界面美观、功能强大、交互流畅
                </p>
              </div>
            </div>
          </button>

          {/* 提示信息 */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700">
              💡 <span className="font-medium">提示：</span>
              两个编辑器都支持化学结构式绘制与编辑，快速版适合简单快速的操作，精美版提供更丰富的功能和更好的视觉体验。
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default ChemDrawSelector;
