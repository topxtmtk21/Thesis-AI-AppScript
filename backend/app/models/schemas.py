from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ProcessDocumentRequest(BaseModel):
    filename: str
    text: str
    api_key: str
    pinecone_api_key: str
    workspace_id: Optional[str] = None
    authors: Optional[str] = None
    year: Optional[str] = None
    theory: Optional[str] = None
    methodology: Optional[str] = None


class AnalyzeDocumentRequest(BaseModel):
    filename: str
    text: str
    api_key: str
    pinecone_api_key: str
    workspace_id: Optional[str] = None


class ChatRequest(BaseModel):
    question: str
    api_key: str
    pinecone_api_key: str
    filename: Optional[str] = None
    workspace_id: Optional[str] = None


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
    format: str
    documents: List[Dict[str, Any]]


class SynthesisRequest(BaseModel):
    api_key: str
    documents: List[Dict[str, str]]
    workspace_id: Optional[str] = None


class AnalyzeNewsRequest(BaseModel):
    api_key: str
    text: str
    source_name: Optional[str] = ""
    published_date: Optional[str] = ""
    spreadsheet_id: Optional[str] = ""
    workspace_id: Optional[str] = None


class CompareNewsRequest(BaseModel):
    api_key: str
    articles: List[Dict[str, str]]
    spreadsheet_id: Optional[str] = ""
    workspace_id: Optional[str] = None


class CodeInterviewRequest(BaseModel):
    api_key: str
    transcript: str
    interviewee_role: Optional[str] = ""
    spreadsheet_id: Optional[str] = ""
    workspace_id: Optional[str] = None


class AppendSheetRowRequest(BaseModel):
    spreadsheet_id: str
    source: Optional[str] = "Web App"
    method: Optional[str] = "Dan van ban (NotebookLM)"
    filename: Optional[str] = ""
    result: Dict[str, Any]
    workspace_id: Optional[str] = None
