#!/data/data/com.termux/files/usr/bin/sh
set -eu

cd /sdcard/Download/dm-chat-backend

if ! command -v node >/dev/null 2>&1; then
  pkg update -y
  pkg install -y nodejs
fi

npm install --omit=dev
PORT=8787 CORS_ORIGIN="*" npm start > backend.log 2>&1 &

echo "DM backend started on port 8787"
echo "Log: /sdcard/Download/dm-chat-backend/backend.log"
