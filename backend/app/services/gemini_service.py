import json
from google import genai
from google.genai import types
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

class GeminiService:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model_name = 'gemini-3.6-flash'

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
  "authorYear": "Tên tác giả và năm xuất bản (VD: Smith et al., 2023)",
  "title": "Tựa đề bài báo",
  "journal": "Tên tạp chí",
  "apa7": "Trích dẫn chuẩn APA 7th của bài báo này",
  "theory": "Tóm tắt Khung lý thuyết bằng tiếng Việt",
  "methodology": "Phương pháp nghiên cứu bằng tiếng Việt",
  "sampleSize": "Quy mô mẫu (Sample Size) bằng tiếng Việt",
  "keyFindings": "Các kết quả chính bằng tiếng Việt",
  "researchGap": "Khoảng trống nghiên cứu (Research Gap) bằng tiếng Việt",
  "limitations": "Hạn chế của nghiên cứu (Limitations) bằng tiếng Việt",
  "originalQuote": "Một câu trích dẫn nguyên văn xuất sắc và quan trọng nhất (bằng tiếng Anh)",
  "translatedQuote": "Bản dịch tiếng Việt của câu trích dẫn trên",
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

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)

    @retry(
        wait=wait_exponential(multiplier=2, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def synthesize_literature(self, documents: list) -> str:
        prompt = "Bạn là một Giáo sư hướng dẫn Tiến sĩ (PhD Supervisor) chuyên viết Literature Review xuất sắc.\n"
        prompt += "Hãy tổng hợp các bài báo sau thành một đoạn Literature Review chuyên nghiệp. So sánh, đối chiếu, tìm ra mâu thuẫn, điểm chung và xu hướng nghiên cứu.\n\n"
        for i, doc in enumerate(documents):
            prompt += f"--- BÀI BÁO {i+1} ---\n"
            for k, v in doc.items():
                prompt += f"{k}: {v}\n"
            prompt += "\n"
        
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt
        )
        return response.text

    @retry(
        wait=wait_exponential(multiplier=2, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def analyze_pdf_native(self, pdf_path: str) -> dict:
        pdf_file = self.client.files.upload(file=pdf_path)
        prompt = """Bạn là một Giáo sư hướng dẫn Tiến sĩ cực kỳ nghiêm khắc. Đọc kỹ văn bản bài báo học thuật dưới đây.
Đặc biệt chú ý đến các BẢNG BIỂU (Tables) và HÌNH ẢNH (Figures) để trích xuất số liệu thống kê quan trọng (p-value, R-square, hệ số beta...).
Bóc tách thông tin BẮT BUỘC theo ĐÚNG định dạng JSON sau (không dùng markdown).

{
  "authors": "Tác giả",
  "year": "Năm xuất bản",
  "authorYear": "Tên tác giả và năm xuất bản (VD: Smith et al., 2023)",
  "title": "Tựa đề bài báo",
  "journal": "Tên tạp chí",
  "apa7": "Trích dẫn chuẩn APA 7th của bài báo này",
  "theory": "Tóm tắt Khung lý thuyết bằng tiếng Việt",
  "methodology": "Phương pháp nghiên cứu bằng tiếng Việt",
  "sampleSize": "Quy mô mẫu (Sample Size) bằng tiếng Việt",
  "keyFindings": "Các kết quả chính bằng tiếng Việt (Bao gồm số liệu thống kê quan trọng từ các Bảng/Hình ảnh)",
  "researchGap": "Khoảng trống nghiên cứu (Research Gap) bằng tiếng Việt",
  "limitations": "Hạn chế của nghiên cứu (Limitations) bằng tiếng Việt",
  "originalQuote": "Một câu trích dẫn nguyên văn xuất sắc và quan trọng nhất (bằng tiếng Anh)",
  "translatedQuote": "Bản dịch tiếng Việt của câu trích dẫn trên",
  "full_bibliography": ["Trích dẫn 1 chi tiết...", "Trích dẫn 2 chi tiết..."],
  "references": ["Bài báo trích dẫn 1", "Bài báo trích dẫn 2"],
  "highlight_quotes": {
    "yellow": ["Trích dẫn nguyên văn bằng Tiếng Anh thể hiện khái niệm cốt lõi (Main Ideas) có kèm theo số trang, ví dụ: 'Quote' (p. 2)"],
    "blue": ["Trích dẫn nguyên văn bằng Tiếng Anh về Phương pháp/Data có kèm số trang"],
    "green": ["Trích dẫn nguyên văn bằng Tiếng Anh về Kết quả chính có kèm số trang"],
    "red": ["Trích dẫn nguyên văn bằng Tiếng Anh về Khoảng trống/Hạn chế có kèm số trang"],
    "purple": ["Trích dẫn nguyên văn xuất sắc nhất của bài báo có kèm số trang"],
    "orange": ["Trích dẫn nguyên văn bằng Tiếng Anh về Hướng nghiên cứu tương lai có kèm số trang"]
  }
}
LƯU Ý: Các mục trong "highlight_quotes" bắt buộc phải TRÍCH DẪN NGUYÊN VĂN 100% (COPY Y HỆT) từ văn bản và nối thêm số trang (ví dụ: (p. 15))."""
        
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=[pdf_file, prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)

