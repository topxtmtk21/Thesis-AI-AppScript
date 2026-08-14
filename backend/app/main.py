from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
