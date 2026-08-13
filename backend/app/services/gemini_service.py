import google.generativeai as genai
import json
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

class GeminiService:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    @retry(
        wait=wait_exponential(multiplier=2, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def analyze_document(self, text: str) -> dict:
        prompt = f"""Bạn là một Giáo sư hướng dẫn Tiến sĩ cực kỳ nghiêm khắc. Đọc kỹ đoạn văn bản bài báo học thuật dưới đây.
Bóc tách thông tin BẮT BUỘC theo ĐÚNG định dạng JSON sau (không dùng markdown).

{{
  "authors": "Tác giả",
  "year": "Năm xuất bản",
  "title": "Tựa đề bài báo",
  "journal": "Tên tạp chí",
  "theory": "Tóm tắt Khung lý thuyết bằng tiếng Việt",
  "methodology": "Phương pháp nghiên cứu bằng tiếng Việt",
  "keyFindings": "Các kết quả chính bằng tiếng Việt",
  "references": ["Bài báo trích dẫn 1", "Bài báo trích dẫn 2"],
  "highlight_quotes": {{
    "yellow": ["Trích dẫn nguyên văn bằng Tiếng Anh thể hiện khái niệm cốt lõi (Main Ideas)"],
    "blue": ["Trích dẫn nguyên văn bằng Tiếng Anh về Phương pháp/Data"],
    "green": ["Trích dẫn nguyên văn bằng Tiếng Anh về Kết quả chính"],
    "red": ["Trích dẫn nguyên văn bằng Tiếng Anh về Khoảng trống/Hạn chế"],
    "purple": ["Trích dẫn nguyên văn xuất sắc nhất của bài báo"],
    "orange": ["Trích dẫn nguyên văn bằng Tiếng Anh về Hướng nghiên cứu tương lai"]
  }}
}}

LƯU Ý: Các mục trong "highlight_quotes" bắt buộc phải TRÍCH DẪN NGUYÊN VĂN 100% (COPY Y HỆT) từ văn bản.
--- BẮT ĐẦU VĂN BẢN ---
{text[:150000]}
--- KẾT THÚC VĂN BẢN ---"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
