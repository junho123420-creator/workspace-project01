# AWS 콘솔 (조회 · 제어)

EC2 / S3 / VPC / CloudFront / IAM 을 브라우저에서 조회하고, 내 리소스(이름에 `wnsgh2929` 포함)만 제어합니다.

```
backend/    FastAPI + boto3 (API: /api/...)
frontend/   React (Vite)
```

## 한 번에 실행

```bash
./run.sh      # 백엔드 + 프론트, 종료는 Ctrl+C
```

## 따로 실행 (터미널 2개)

```bash
# 1) 백엔드  — http://localhost:8000
cd backend
source .venv/bin/activate
python main.py

# 2) 프론트  — http://localhost:5173
cd frontend
npm run dev
```

브라우저에서 http://localhost:5173 (또는 WSL IP:5173) 로 접속합니다.

## 최초 설치

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd frontend && npm install
```

## 설정 (환경변수)
- `AWS_PROFILE`(기본 lab), `AWS_REGION`(기본 ap-northeast-2), `OWNER_ID`(기본 wnsgh2929)
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`: 둘 다 설정하면 백엔드에 Basic 인증 적용
- 프론트가 바라보는 백엔드 주소: `VITE_BACKEND`(기본 http://localhost:8000)
