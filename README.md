# OrganicChem-AI

## 一、运行环境

1. **Node.js 20.19.5**
   
   * 前往 [Node.js 官网](https://nodejs.org/) 下载并安装 **Node.js 20.19.5**。
   * 或直接下载压缩包：[Node.js v20.19.5](https://nodejs.org/dist/v20.19.5/)，解压后将 `node.exe` 路径添加到系统环境变量中。

2. **Imago 2.0.0**
   
   * 前往 [Imago 下载页面](https://lifescience.opensource.epam.com/download/imago.html) 下载 **Imago 2.0.0**。
   * 下载后将 `imago_console.exe` 文件直接放置在 `D:` 盘根目录下。

3. **Open Babel 3.1.1**
   
   * 前往 [Open Babel Releases](https://github.com/openbabel/openbabel/releases) 下载并安装 **Open Babel 3.1.1**。
   * 安装完成后，将 Open Babel 安装目录添加到系统的环境变量中，以便命令行可以直接调用 `obabel`。

---

## 二、电脑端运行方式

1. 下载并解压项目文件夹，使用 **VS Code** 打开项目根目录。
2. 在终端运行以下命令安装依赖：

   ```bash
   npm install
   ```
3. 修改 `.env` 文件，确保：

   ```bash
   VITE_API_BASE=http://localhost:3001
   ```
4. 启动前端：

   ```bash
   npm run dev
   ```
5. 新建一个终端窗口（仍在项目根目录），启动后端服务：

   ```bash
   node server.js
   ```
6. 在电脑浏览器打开并访问：

   ```bash
   http://localhost:5173/
   ```

   此时即可在电脑端使用。

---

## 三、移动端运行方式

> 移动端访问需确保移动端设备与电脑处于同一局域网，且保证该局域网未设置端与端隔离（北京大学校园网由于设有端与端间的隔离无法使用）。
> 
> 只需在手机上开启热点，并让电脑连接到该热点，即可正常使用。
> 
> 若一定要使用校园网，请参见<https://github.com/doralyyyyy/QChat>的网络配置方式调整接口，或私下联系作者。

1. 在电脑端（**VS Code**）打开项目根目录的终端，先用 `--host` 启动前端以便显示 Network 地址：

   ```bash
   npm run dev -- --host
   ```
2. 在终端输出里找到 **Network** 后面的链接（示例）：

   ```bash
   http://192.168.1.10:5173/
   ```
3. 将该 IP 替换进项目根目录的 `.env`，**但端口改为后端端口 `3001`，并删掉末尾斜杠**，例如：

   ```bash
   VITE_API_BASE=http://192.168.1.10:3001
   ```
4. 修改完 `.env` 后，重启前端（停止后重新运行）：

   ```bash
   npm run dev -- --host
   ```
5. 在一个新建终端窗口启动后端服务：

   ```bash
   node server.js
   ```
6. 在移动端浏览器中访问前面终端给出的 **Network 链接**（示例）：

   ```bash
   http://192.168.1.10:5173/
   ```

   即：在移动端上打开 `http://<电脑LAN IP>:5173/` 即可登录并使用。

---

## 四、注意事项

* **Node.js**：必须使用 **v20.19.5**，不要使用最新版本或其他版本，否则可能出现兼容性问题。
* **Imago**：必须使用 **2.0.0** 版本，并将 `imago_console.exe` 放置在 D 盘根目录。
* **Open Babel**：必须使用 **3.1.1** 版本，并将其安装目录添加到系统环境变量。**如果使用其他版本，命令行指令可能不一致，会导致程序出错或功能异常。**
* 推荐使用 **VS Code** 作为开发和使用环境以便同时打开多个终端和查看输出。
* 前端与后端需同时运行（前端读取 `.env` 中的 `VITE_API_BASE` 以连接后端）。
* 修改 `.env` 后需要重启前端（`npm run dev`），否则变更不会生效。
* 移动端访问电脑的 Network 链接时，**移动端与电脑须连接同一局域网**（也可使用内网穿透工具建立连接），并确保电脑防火墙允许 5173/3001 端口的局域网访问。
* **平板电脑 / iPad 请使用横屏浏览**。
* 若需要 `.env` 文件，请私下联系作者。
