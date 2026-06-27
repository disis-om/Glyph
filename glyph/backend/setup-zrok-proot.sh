#!/data/data/com.termux/files/usr/bin/sh
set -eu

ZROK_TOKEN="${1:-${ZROK_TOKEN:-}}"
ZROK_NAME="${2:-${ZROK_NAME:-dm-chat-api}}"

if [ -z "$ZROK_TOKEN" ]; then
  echo "Usage: sh setup-zrok-proot.sh <zrok-account-token> [reserved-name]"
  exit 2
fi

pkg install -y proot-distro procps nodejs
proot-distro install debian >/dev/null 2>&1 || true

proot-distro login debian -- bash -lc "cp /sdcard/Download/dm-chat-backend/zrok2 /usr/local/bin/zrok2 && chmod +x /usr/local/bin/zrok2 && zrok2 enable '$ZROK_TOKEN' && zrok2 create name -n public '$ZROK_NAME' || true"

cat > /sdcard/Download/dm-chat-backend/.zrok-name <<EOF
$ZROK_NAME
EOF

echo "zrok proot ready: https://${ZROK_NAME}.share.zrok.io"
