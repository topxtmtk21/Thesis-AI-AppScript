from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.routers import document, chat, jobs
import os

app = FastAPI(title="Academic Tool Backend API")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Backend không tự chứa secret nào cả - mọi Gemini/Pinecone key đều do client gửi kèm
# mỗi request - nhưng nếu URL backend bị lộ, ai cũng gọi được API (tốn tài nguyên,
# spam Gemini/Pinecone bằng key của chính họ...). Đặt biến môi trường
# BACKEND_SHARED_SECRET để chỉ Apps Script/Web Dashboard đã cấu hình đúng secret mới
# gọi được. Để trống thì tắt kiểm tra này (giữ hành vi cũ, không phá vỡ deploy hiện tại).
BACKEND_SHARED_SECRET = os.environ.get("BACKEND_SHARED_SECRET")

# /api/graph được nhúng qua <iframe src="..."> trong Apps Script nên trình duyệt không
# gắn được header tuỳ chỉnh - phải loại trừ khỏi việc kiểm tra secret.
_SECRET_EXEMPT_PATHS = {"/api/graph"}


@app.middleware("http")
async def verify_backend_secret(request: Request, call_next):
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
    return await call_next(request)


# Include Routers
app.include_router(document.router, prefix="/api", tags=["Document"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(jobs.router, prefix="/api", tags=["Jobs"])

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Backend is running with modern structure!"}

# Mount Frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
