# OrganicChem-AI

> **If you are on the Peking University campus network, or off-campus but connected to the PKU intranet VPN, and only want a quick trial, you can access the app directly without deployment:**
>
> **[http://10.129.243.50:5173/](http://10.129.243.50:5173/)**
>
> If access or usage is abnormal, the website or PKU CLab platform may be under maintenance. In that case, follow the instructions below for local deployment or debugging.

## 1. Runtime Environment

> Please enable an overseas proxy during runtime, otherwise some features may not work.

**Node.js 20.19.5**

* Go to the [Node.js official website](https://nodejs.org/) and install **Node.js 20.19.5**.
* Or download the archive directly: [Node.js v20.19.5](https://nodejs.org/dist/v20.19.5/). After extraction, add the folder containing `node.exe` to your system environment variables.

**`.env` File**

* **You must configure the `.env` file before the first run**: copy `.env.example` to `.env`, then fill in required fields according to the comments (API key, email, etc.).

* If you need a ready-to-use `.env` file, please contact the author privately.

**Database Files**

* Because the database files are too large for GitHub, please download `memory.db`, `memory.db-shm`, `memory.db-wal`, and the `covers` folder from [PKU Cloud Disk](https://disk.pku.edu.cn/link/AA53BE8BB4F83E488F8896910B2368FB84), then place them in the project root directory.

---

## 2. Desktop Setup

1. Download and extract the project folder, then open the project root in **VS Code**.
2. Run the following command in terminal to install dependencies:

   ```bash
   npm install
   ```
3. Update `.env` and make sure:

   ```bash
   VITE_API_BASE=http://localhost:3001
   ```
4. Start the frontend:

   ```bash
   npm run dev
   ```
5. Open a new terminal window (still in the project root) and start the backend service:

   ```bash
   node server.js
   ```
6. Open this URL in your desktop browser:

   ```bash
   http://localhost:5173/
   ```

   **Chrome or Edge is recommended** for voice input support.

---

## 3. Mobile Setup

> **Mobile Access Notes**
>
> By default, mobile access requires the mobile device and computer to be on the same LAN, and the LAN must not enforce client isolation (for example, PKU campus network has client isolation, so the default method may not work).
>
> For local testing, you can enable a hotspot on your phone and connect the computer to that hotspot.
>
> **If you need cross-network access**, refer to the network configuration approach in [https://github.com/doralyyyyy/QChat](https://github.com/doralyyyyy/QChat), or contact the author privately.

1. On desktop (**VS Code**), open a terminal in project root and start the frontend with `--host` so that a Network URL is shown:

   ```bash
   npm run dev -- --host
   ```
2. In terminal output, find the URL shown after **Network** (example):

   ```bash
   http://192.168.1.10:5173/
   ```
3. Replace the IP in `.env` (project root), **change the port to backend port `3001`, and remove the trailing slash**, for example:

   ```bash
   VITE_API_BASE=http://192.168.1.10:3001
   ```
4. After editing `.env`, restart the frontend (stop and run again):

   ```bash
   npm run dev -- --host
   ```
5. Start backend service in a new terminal window:

   ```bash
   node server.js
   ```
6. Open the **Network URL** shown earlier in a mobile browser (example):

   ```bash
   http://192.168.1.10:5173/
   ```

---

## 4. Notes

### 1) Software Version Requirement

* **Node.js**: You must use **20.19.5**. Do not use newer or other versions, otherwise compatibility issues may occur.

### 2) Development Environment and Runtime

* **VS Code** is recommended so you can open multiple terminals and monitor outputs conveniently.
* Frontend and backend must run at the same time (frontend reads `VITE_API_BASE` in `.env` to connect to backend).
* After modifying `.env`, restart frontend (`npm run dev`) or changes will not take effect.

### 3) Network and Devices

* When mobile accesses the desktop Network URL, **mobile and desktop must be on the same LAN** (or use a tunneling tool), and ensure desktop firewall allows LAN access to ports `5173` and `3001`.
* **For tablets / iPad, use landscape orientation**.

### 4) Browser and Voice Input

* On desktop, **Chrome** or **Edge** is recommended. Other browsers may not support voice input.
* Due to mobile browser limitations (lower permission level over HTTP), some mobile devices (e.g., some Huawei models) may not support voice input. On supported systems (such as iOS), make sure browser and port permissions include **microphone access**, and enable features similar to **“smart voice input”**.
* If you see a `"network"` error, it means connection to overseas services failed; enable an overseas proxy.
* If you see a `"not-allowed"` error, microphone permission is not granted for this site.
* If you see a `"Failed to fetch"` error, backend configuration is likely incorrect. Follow the steps in sections **2** and **3** strictly.
