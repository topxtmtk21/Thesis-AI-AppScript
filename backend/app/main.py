from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from pinecone import Pinecone
from app.api.routers import document, chat, jobs, research, sheets
import os
import time
import uuid

app = FastAPI(title="Academic Tool Backend API")

def _get_cors_origins():
    raw = os.environ.get("BACKEND_CORS_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

# Add CORS Middleware
_cors_origins = _get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Backend không tự chứa secret nào cả - mọi Gemini/Pinecone key đều do client gửi kèm
# mỗi request - nhưng nếu URL backend bị lộ, ai cũng gọi được API (tốn tài nguyên,
# spam Gemini/Pinecone bằng key của chính họ...). Đặt biến môi trường
# BACKEND_SHARED_SECRET để chỉ Apps Script/Web Dashboard đã cấu hình đúng secret mới
# gọi được. Để trống thì tắt kiểm tra này (giữ hành vi cũ, không phá vỡ deploy hiện tại).
BACKEND_SHARED_SECRET = os.environ.get("BACKEND_SHARED_SECRET")

# /api/graph và /api/timeline được nhúng qua <iframe src="..."> trong Apps Script nên
# trình duyệt không gắn được header tuỳ chỉnh - phải loại trừ khỏi việc kiểm tra secret.
_SECRET_EXEMPT_PATHS = {"/api/graph", "/api/timeline"}


@app.middleware("http")
async def verify_backend_secret(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    started_at = time.perf_counter()
    if (
        BACKEND_SHARED_SECRET
        and request.url.path.startswith("/api/")
        and request.url.path not in _SECRET_EXEMPT_PATHS
    ):
        if request.headers.get("x-backend-secret") != BACKEND_SHARED_SECRET:
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: thiếu hoặc sai header X-Backend-Secret."}
            )
    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse(
            status_code=500,
            content={"detail": "Backend encountered an unexpected error.", "request_id": request_id},
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = str(round((time.perf_counter() - started_at) * 1000))
    if response.status_code in (429, 502, 503, 504) and "Retry-After" not in response.headers:
        response.headers["Retry-After"] = "5"
    return response


# Include Routers
app.include_router(document.router, prefix="/api", tags=["Document"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(jobs.router, prefix="/api", tags=["Jobs"])
app.include_router(research.router, prefix="/api", tags=["Research"])
app.include_router(sheets.router, prefix="/api", tags=["Sheets"])

@app.get("/health")
def health_check(api_key: Optional[str] = None, pinecone_api_key: Optional[str] = None):
    # Không có key nào server tự giữ sẵn (mọi Gemini/Pinecone key đều do client cung cấp
    # theo từng request), nên mặc định chỉ xác nhận tiến trình còn sống. Truyền kèm
    # api_key/pinecone_api_key (query param) nếu muốn kiểm tra thật kết nối tới 2 dịch vụ
    # đó - hữu ích khi gắn vào công cụ giám sát uptime.
    checks = {"server": "ok"}
    healthy = True

    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            client.models.generate_content(
                model="gemini-3.7-flash",
                contents="ping",
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="low"),
                    max_output_tokens=5
                )
            )
            checks["gemini"] = "ok"
        except Exception as e:
            checks["gemini"] = f"error: {e}"
            healthy = False

    if pinecone_api_key:
        try:
            Pinecone(api_key=pinecone_api_key).list_indexes()
            checks["pinecone"] = "ok"
        except Exception as e:
            checks["pinecone"] = f"error: {e}"
            healthy = False

    return {"status": "ok" if healthy else "degraded", "checks": checks}

# Mount Frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
