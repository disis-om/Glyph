
<div align="center">
  <h1>✨ Glyph</h1>
  <p><b>Instagram-style Realtime Direct Messaging Architecture</b></p>
  <p>
    <img src="https://img.shields.io/badge/Frontend-React-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/Backend-Node.js-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Sockets-Socket.IO-010101?style=flat-square&logo=socket.io&logoColor=white" alt="Socket.io" />
  </p>
</div>

---

**Glyph** is a full-stack, real-time chat application featuring a dedicated client interface, a robust Node.js backend, and a real-time observatory dashboard. 

## 📂 Architecture

The project is split into three decoupled environments:

```text
📦 Glyph
 ┣ 📂 frontend/     # Main React DM application (Edge-ready)
 ┣ 📂 backend/      # Node.js + Express + Socket.IO server (Termux compatible)
 ┗ 📂 observatory/  # React-based backend monitoring dashboard

```

---

## 🚀 Quick Start

### 1. Frontend (Client App)

The main user interface. Built to be deployed on Edge networks.

```bash
cd frontend
npm install
npm run dev

```

> **Deployment:** Build using `npm run build` and deploy the `dist/` directory to Vercel, Netlify, EdgeOne Pages, or similar platforms.

### 2. Backend (API & WebSockets)

Handles real-time communication. Designed to run anywhere, including Android environments via Termux.

**Standard Local Run:**

```bash
cd backend
npm install
npm start

```

**Termux Environment (Android):**

```bash
cd /sdcard/Download/dm-chat-backend
sh start-zrok-proot.sh

```

### 3. Observatory (Monitoring)

A dedicated dashboard to monitor backend health and real-time active metrics.

```bash
cd observatory
npm install
npm run dev

```

> **Deployment:** Build using `npm run build`. Can be deployed as a separate standalone site or run on `localhost`.

---

## 📡 Endpoints & Telemetry

Monitor your backend status via the following routes:

* **Health Check:** `GET /health`
*(e.g., `https://your-backend-url/health`)*
* **Live Metrics:** `GET /metrics`
*(e.g., `https://your-backend-url/metrics`)*

---

## ⚠️ Important Notes

* **Data Persistence:** Backend data is currently **in-memory**. All data will reset upon server restart.
* **Termux Restarts:** If the host device or Termux session restarts, you must manually re-run `sh start-zrok-proot.sh` from the backend directory to restore the public tunnel.

```
