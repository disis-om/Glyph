#!/data/data/com.termux/files/usr/bin/sh
set -eu

cd /sdcard/Download/dm-chat-backend

ZROK_NAME="${1:-${ZROK_NAME:-}}"
if [ -z "$ZROK_NAME" ] && [ -f .zrok-name ]; then
  ZROK_NAME="$(cat .zrok-name)"
fi
if [ -z "$ZROK_NAME" ]; then
  ZROK_NAME="dm-chat-api"
fi

termux-wake-lock >/dev/null 2>&1 || true

npm install --omit=dev

pkill -f "cloudflared tunnel" >/dev/null 2>&1 || true
pkill -f "zrok2 share public" >/dev/null 2>&1 || true
pkill -f "node index.js" >/dev/null 2>&1 || true
sleep 8

PORT=8787 CORS_ORIGIN="*" npm start > backend.log 2>&1 &
sleep 2

proot-distro login debian -- bash -lc "zrok2 create name -n public '$ZROK_NAME' >/dev/null 2>&1 || true"
proot-distro login debian -- bash -lc "zrok2 share public http://127.0.0.1:8787 -n 'public:${ZROK_NAME}' --headless" > zrok.log 2>&1 &

echo "Public: https://${ZROK_NAME}.shares.zrok.io"
