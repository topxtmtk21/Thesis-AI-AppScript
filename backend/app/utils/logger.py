import logging
import sys
from datetime import datetime

# Configure standard logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

def get_logger(module_name: str) -> logging.Logger:
    """Returns a configured logger for the specified module."""
    return logging.getLogger(module_name)

def handle_api_error(e: Exception, context: str) -> str:
    """
    Parses common API exceptions (like 429 Quota Exceeded) 
    and returns a user-friendly Vietnamese error message.
    """
    error_str = str(e)
    
    if "429" in error_str or "Quota exceeded" in error_str:
        if "embed_content" in error_str:
            return "Lỗi API: Bạn đã vượt quá giới hạn 1000 lần nhúng (embeddings) mỗi ngày của gói Miễn phí. Hãy thiết lập Billing trên AI Studio hoặc quay lại vào ngày mai."
        else:
            return "Lỗi API: Bạn đã gửi quá nhiều yêu cầu cùng lúc (Hoặc hết giới hạn 1500 câu hỏi/ngày). Hãy thiết lập Billing trên AI Studio hoặc thử lại sau."
            
    if "403" in error_str or "API_KEY_INVALID" in error_str or "invalid" in error_str.lower():
        return "Lỗi API: API Key của bạn bị sai, không hợp lệ hoặc chưa được cấp quyền."
        
    return f"Lỗi hệ thống ({context}): {error_str}. Tham khảo chi tiết trong Logs của Render."
