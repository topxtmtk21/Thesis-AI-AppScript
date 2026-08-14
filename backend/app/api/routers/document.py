from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, HTMLResponse
from typing import List, Dict, Any
import tempfile
import fitz
import os

from app.models.schemas import ExportRequest, ExportRisRequest, AnalyzeDocumentRequest, SynthesisRequest
from app.services.export_service import DocumentExporter
from app.services.pdf_service import PDFHighlighter
from app.services.gemini_service import GeminiService
from app.services.pinecone_service import PineconeManager
from app.services.drive_service import DriveManager
from app.services.graph_service import KnowledgeGraphManager
from app.utils.logger import get_logger, handle_api_error

logger = get_logger("document_router")

router = APIRouter()

@router.get("/graph")
def get_graph():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    html_path = os.path.join(base_dir, 'frontend', 'knowledge_graph.html')
    if os.path.exists(html_path):
        return FileResponse(html_path)
    else:
        return HTMLResponse("<h1>Chưa có dữ liệu Đồ thị Kiến thức</h1><p>Vui lòng chạy Phân tích Nâng cao ít nhất 1 bài báo để hệ thống tự tạo sơ đồ.</p>")

db_instances = {}

def get_db(pinecone_key: str, gemini_key: str):
    if pinecone_key not in db_instances:
        db_instances[pinecone_key] = PineconeManager(pinecone_key, gemini_key)
    return db_instances[pinecone_key]

@router.post("/analyze-and-process")
def analyze_and_process(req: AnalyzeDocumentRequest):
    try:
        gemini = GeminiService(req.api_key)
        db = get_db(req.pinecone_api_key, req.api_key)
        kg = KnowledgeGraphManager()
        
        result_json = gemini.analyze_document(req.text)
        
        db.add_document({
            "filename": req.filename,
            "text": req.text,
            "authors": result_json.get("authors", ""),
            "year": result_json.get("year", ""),
            "theory": result_json.get("theory", ""),
            "methodology": result_json.get("methodology", ""),
            "detailedFindings": result_json.get("detailedFindings", [])
        })
        
        authors_year = f'{result_json.get("authors", "")} ({result_json.get("year", "")})'
        kg.add_node(authors_year, title=result_json.get("title", ""), group=1)
        for ref in result_json.get("references", []):
            kg.add_node(ref, group=2)
            kg.add_relation(authors_year, ref, "cites")
        kg.save_graph()
        
        return {"status": "success", "data": result_json}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-pdf-blob")
async def analyze_pdf_blob(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    pinecone_api_key: str = Form(...)
):
    try:
        gemini = GeminiService(api_key)
        db = get_db(pinecone_api_key, api_key)
        kg = KnowledgeGraphManager()

        temp_input = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        content = await file.read()
        temp_input.write(content)
        temp_input.close()
        
        # Use Native PDF Analysis (Vision) instead of fitz text extraction
        result_json = gemini.analyze_pdf_native(temp_input.name)
        
        db.add_document({
            "filename": file.filename,
            "text": "Native PDF Analysis (No raw text stored)",
            "authors": result_json.get("authors", ""),
            "year": result_json.get("year", ""),
            "theory": result_json.get("theory", ""),
            "methodology": result_json.get("methodology", "")
        })
        
        authors_year = f'{result_json.get("authors", "")} ({result_json.get("year", "")})'
        kg.add_node(authors_year, title=result_json.get("title", ""), group=1)
        for ref in result_json.get("references", []):
            kg.add_node(ref, group=2)
            kg.add_relation(authors_year, ref, "cites")
        kg.save_graph()
        
        return {"status": "success", "data": result_json}
    except Exception as e:
        logger.error(f"Error in analyze_pdf_blob: {e}")
        friendly_error = handle_api_error(e, "analyze_pdf_blob")
        raise HTTPException(status_code=500, detail=friendly_error)

@router.post("/synthesis")
def synthesize_literature(req: SynthesisRequest):
    try:
        gemini = GeminiService(req.api_key)
        report = gemini.synthesize_literature(req.documents)
        return {"status": "success", "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-raw-text")
async def analyze_raw_text(
    text: str = Form(...),
    api_key: str = Form(...),
    pinecone_api_key: str = Form(...)
):
    try:
        gemini = GeminiService(api_key)
        db = get_db(pinecone_api_key, api_key)
        kg = KnowledgeGraphManager()
        
        result_json = gemini.format_raw_text(text)
        
        db.add_document({
            "filename": "NotebookLM_Extract",
            "text": text,
            "authors": result_json.get("authors", ""),
            "year": result_json.get("year", ""),
            "theory": result_json.get("theory", ""),
            "methodology": result_json.get("methodology", "")
        })
        
        authors_year = f'{result_json.get("authors", "")} ({result_json.get("year", "")})'
        kg.add_node(authors_year, title=result_json.get("title", ""), group=1)
        for ref in result_json.get("references", []):
            kg.add_node(ref, group=2)
            kg.add_relation(authors_year, ref, "cites")
        kg.save_graph()
        
        return {"status": "success", "data": result_json}
    except Exception as e:
        logger.error(f"Error in analyze_raw_text: {e}")
        friendly_error = handle_api_error(e, "analyze_raw_text")
        raise HTTPException(status_code=500, detail=friendly_error)

@router.get("/documents")
def get_documents(api_key: str, pinecone_api_key: str):
    try:
        db = get_db(pinecone_api_key, api_key)
        docs = db.get_all_documents()
        return {"status": "success", "documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export")
def export_docs(req: ExportRequest):
    try:
        if req.format == 'md':
            md_content = DocumentExporter.export_md(req.documents)
            return {"status": "success", "data": md_content, "filename": "exported_documents.md"}
        elif req.format == 'docx':
            path = DocumentExporter.export_docx(req.documents)
            return FileResponse(path=path, filename="exported_documents.docx")
        elif req.format == 'xlsx':
            path = DocumentExporter.export_xlsx(req.documents)
            return FileResponse(path=path, filename="exported_documents.xlsx")
        else:
            raise HTTPException(status_code=400, detail="Invalid format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export-ris")
def export_ris(req: ExportRisRequest):
    try:
        ris_content = DocumentExporter.export_ris(req.dict())
        return {"status": "success", "ris": ris_content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    pinecone_api_key: str = Form(...)
):
    try:
        # 1. Khởi tạo các Service
        gemini = GeminiService(api_key)
        db = get_db(pinecone_api_key, api_key)
        kg = KnowledgeGraphManager()
        drive = None
        try:
            drive = DriveManager()
        except:
            pass # Bỏ qua nếu không có credentials.json

        # Kiểm tra trùng lặp
        if db.check_document_exists(file.filename):
            raise HTTPException(status_code=409, detail=f"Tài liệu '{file.filename}' đã tồn tại trong hệ thống. Vui lòng không phân tích lại để tiết kiệm chi phí.")

        # 2. Đọc file
        temp_input = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        content = await file.read()
        temp_input.write(content)
        temp_input.close()
        
        doc = fitz.open(temp_input.name)
        text = "".join(page.get_text() for page in doc)
        doc.close()
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="Không thể trích xuất chữ từ PDF.")

        # 3. Phân tích văn bản qua Gemini
        result_json = gemini.analyze_document(text)
        
        # 4. Lưu vào Vector DB (Pinecone)
        doc_id = db.add_document({
            "filename": file.filename,
            "text": text,
            "authors": result_json.get("authors", ""),
            "year": result_json.get("year", ""),
            "theory": result_json.get("theory", ""),
            "methodology": result_json.get("methodology", ""),
            "detailedFindings": result_json.get("detailedFindings", [])
        })

        # 5. Lưu vào Đồ thị Tri thức (Reference Graph)
        authors_year = f'{result_json.get("authors", "")} ({result_json.get("year", "")})'
        kg.add_node(authors_year, title=result_json.get("title", ""), group=1)
        for ref in result_json.get("references", []):
            kg.add_node(ref, group=2)
            kg.add_relation(authors_year, ref, "cites")
        kg.save_graph()

        # Trả về JSON để Frontend nhanh chóng hiển thị dữ liệu
        return {"status": "success", "data": result_json}
        
    except Exception as e:
        logger.error(f"Error in upload_pdf: {e}")
        friendly_error = handle_api_error(e, "upload_pdf")
        raise HTTPException(status_code=500, detail=friendly_error)
