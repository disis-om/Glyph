#!/data/data/com.termux/files/usr/bin/sh
set -eu

ZROK_TOKEN="${1:-${ZROK_TOKEN:-}}"
ZROK_NAME="${2:-${ZROK_NAME:-dm-chat-api}}"
ZROK_VERSION="2.0.4"
ZROK_URL="https://github.com/openziti/zrok/releases/download/v${ZROK_VERSION}/zrok_${ZROK_VERSION}_linux_arm64.tar.gz"

if [ -z "$ZROK_TOKEN" ]; then
  echo "Usage: sh setup-zrok.sh <zrok-account-token> [reserved-name]"
  echo "Get token from https://api.zrok.io after creating a free zrok account."
  exit 2
fi

pkg install -y nodejs curl tar procps

if [ ! -x "$PREFIX/bin/zrok2" ]; then
  cd "$PREFIX/tmp"
  curl -L "$ZROK_URL" -o zrok2.tar.gz
  tar -xzf zrok2.tar.gz zrok2
  mv zrok2 "$PREFIX/bin/zrok2"
  chmod +x "$PREFIX/bin/zrok2"
fi

if ! zrok2 status >/dev/null 2>&1; then
  zrok2 enable "$ZROK_TOKEN"
fi

zrok2 create name -n public "$ZROK_NAME" >/dev/null 2>&1 || true

cat > /sdcard/Download/dm-chat-backend/.zrok-name <<EOF
$ZROK_NAME
EOF

echo "zrok ready: https://${ZROK_NAME}.share.zrok.io"
