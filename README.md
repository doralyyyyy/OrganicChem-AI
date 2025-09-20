# OrganicChem-AI

## 一、运行环境

请确保已安装 **Node.js v20.19.5**。  
可通过以下方式获取：

- 从 [Node.js 官网](https://nodejs.org/) 下载并安装 **Node.js 20.19.5**  
- 或直接下载压缩包：[Node.js v20.19.5](https://nodejs.org/dist/v20.19.5/)，解压后将 `node.exe` 路径添加到系统环境变量中  

---

## 二、运行步骤

1. 下载并解压项目文件夹（如 `test` 文件夹），使用 **VS Code** 打开项目根目录  

2. 在终端运行以下命令安装依赖：  

   ```bash
   npm install
   ```

3. 启动前端服务：  

   ```bash
   npm run dev
   ```

4. 新建一个终端窗口，定位到项目根目录，运行后端服务：  

   ```bash
   node server.js
   ```

5. 打开浏览器访问：  

   ```
   http://localhost:5173/
   ```

即可使用本项目。  

---

## 三、注意事项

- 必须使用 **Node.js 20.19.5** 版本，否则可能出现兼容性问题  
- 前端与后端需同时运行，确保功能正常  
- 推荐使用 **VS Code** 作为开发环境
- 若需要 `.env` 文件，请私下联系作者获取
