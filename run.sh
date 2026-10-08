#!/usr/bin/env bash
# 백엔드(8000)와 프론트(5173)를 한 번에 실행. 종료는 Ctrl+C.
set -e
cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

for port in 8000 5173; do
  if ss -ltn | grep -q ":$port "; then
    echo "포트 $port 가 이미 사용 중입니다. 먼저 해당 서버를 종료하세요."
    exit 1
  fi
done

(cd backend && .venv/bin/python main.py) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT INT TERM

cd frontend && npm run dev
