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

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi

if ! command -v node >/dev/null 2>&1; then
  pkg install -y nodejs
fi

if ! command -v zrok2 >/dev/null 2>&1; then
  echo "zrok2 missing. Run: sh setup-zrok.sh <zrok-account-token> $ZROK_NAME"
  exit 2
fi

npm install --omit=dev

pkill -f "cloudflared tunnel" >/dev/null 2>&1 || true
pkill -f "zrok2 share public" >/dev/null 2>&1 || true
pkill -f "node index.js" >/dev/null 2>&1 || true

PORT=8787 CORS_ORIGIN="*" npm start > backend.log 2>&1 &
sleep 2
zrok2 share public http://127.0.0.1:8787 -n "public:${ZROK_NAME}" --headless > zrok.log 2>&1 &

echo "Backend: http://127.0.0.1:8787"
echo "Public:  https://${ZROK_NAME}.share.zrok.io"
echo "Log:     /sdcard/Download/dm-chat-backend/zrok.log"
