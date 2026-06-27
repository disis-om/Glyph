#!/data/data/com.termux/files/usr/bin/sh
set -eu

cd /sdcard/Download/dm-chat-backend

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi

if ! command -v node >/dev/null 2>&1; then
  pkg update -y
  pkg install -y nodejs
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  pkg install -y cloudflared
fi

npm install --omit=dev

if ! pgrep -f "node index.js" >/dev/null 2>&1; then
  PORT=8787 CORS_ORIGIN="*" npm start > backend.log 2>&1 &
fi

cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate > tunnel.log 2>&1 &

echo "Public tunnel starting..."
echo "Watch: /sdcard/Download/dm-chat-backend/tunnel.log"
