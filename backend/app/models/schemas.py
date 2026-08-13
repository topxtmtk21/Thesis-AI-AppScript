from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ProcessDocumentRequest(BaseModel):
    filename: str
    text: str
    api_key: str
    pinecone_api_key: str
    authors: Optional[str] = None
    year: Optional[str] = None
    theory: Optional[str] = None
    methodology: Optional[str] = None

class AnalyzeDocumentRequest(BaseModel):
    filename: str
    text: str
    api_key: str
    pinecone_api_key: str

class ChatRequest(BaseModel):
    question: str
    api_key: str
    pinecone_api_key: str

class ExportRisRequest(BaseModel):
    authors: str
    year: str
    title: str
    journal: str
    volume: Optional[str] = ""
    issue: Optional[str] = ""
    pages: Optional[str] = ""
    doi: Optional[str] = ""

class ExportRequest(BaseModel):
    format: str # 'md', 'docx', 'xlsx'
    documents: List[Dict[str, Any]]
