from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest
from app.api.routers.document import get_db
from app.services.gemini_service import GeminiService

router = APIRouter()

@router.post("/chat")
def chat_with_data(req: ChatRequest):
    try:
        db = get_db(req.pinecone_api_key, req.api_key)
        
        # Lấy ngữ cảnh từ Pinecone
        results = db.search(req.question, top_k=3, filename=req.filename)
        context = ""
        if results and "matches" in results:
            for i, match in enumerate(results["matches"]):
                meta = match.get("metadata", {})
                score = match.get("score", 0)
                if score > 0.6:
                    context += f"Tài liệu {i+1} (File: {meta.get('filename', 'Unknown')}):\n{meta.get('text', '')}\n\n"
                    
        # Nếu không có ngữ cảnh, AI tự trả lời
        if not context:
            context = "Không tìm thấy dữ liệu liên quan trong kho tài liệu. Hãy trả lời bằng kiến thức của bạn."
            
        prompt = f"""Bạn là Giáo sư hướng dẫn. Dựa vào ngữ cảnh dưới đây:
{context}

Hãy trả lời câu hỏi của sinh viên: {req.question}
Nếu ngữ cảnh không có thông tin, hãy nói rõ và trả lời theo kiến thức của bạn."""

        gemini = GeminiService(req.api_key)
        response = gemini.client.models.generate_content(
            model=gemini.model_name,
            contents=prompt
        )
        
        return {"status": "success", "answer": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
