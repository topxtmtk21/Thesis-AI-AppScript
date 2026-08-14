import json
from google import genai
from google.genai import types
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Tác vụ trích xuất/định dạng dữ liệu có cấu trúc không cần suy luận nhiều bước,
# nên hạ "thinking level" xuống thấp nhất để giảm đáng kể thời gian phản hồi.
_FAST_THINKING = types.ThinkingConfig(thinking_level="low")


class GeminiService:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model_name = 'gemini-3.7-flash'

    @retry(
        wait=wait_exponential(multiplier=5, min=15, max=60),
        stop=stop_after_attempt(5),
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
  "detailedFindings": [
    {{
      "content": "Nội dung/Phát hiện cốt lõi số 1 (chi tiết, đầy đủ số liệu)",
      "location": "Trang X / Phần Y"
    }},
    {{
      "content": "Nội dung/Phát hiện cốt lõi số 2...",
      "location": "Trang Z / Phần W"
    }}
  ],
  "originalQuote": "Một câu trích dẫn nguyên văn xuất sắc và quan trọng nhất (bằng tiếng Anh)",
  "translatedQuote": "Bản dịch tiếng Việt của câu trích dẫn trên",
  "references": ["Bài báo trích dẫn 1", "Bài báo trích dẫn 2"]
}}

LƯU Ý: "detailedFindings" liệt kê tối đa 8 phát hiện quan trọng nhất (không cần liệt kê hết).
--- BẮT ĐẦU VĂN BẢN ---
{text[:150000]}
--- KẾT THÚC VĂN BẢN ---"""

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=_FAST_THINKING
            )
        )
        data = json.loads(response.text)
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data

    @retry(
        wait=wait_exponential(multiplier=5, min=15, max=60),
        stop=stop_after_attempt(5),
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
        
        # Giữ mức "thinking" mặc định (không hạ xuống "low") vì đây là tác vụ tổng hợp/so sánh
        # nhiều bài báo, cần suy luận sâu hơn các tác vụ trích xuất dữ liệu đơn thuần.
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt
        )
        return response.text

    @retry(
        wait=wait_exponential(multiplier=5, min=15, max=60),
        stop=stop_after_attempt(5),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def analyze_pdf_native(self, pdf_path: str) -> dict:
        pdf_file = self.client.files.upload(file=pdf_path)
        prompt = """Bạn là Giáo sư hướng dẫn Tiến sĩ cực kỳ nghiêm khắc. Đọc kỹ văn bản bài báo học thuật dưới đây (chú ý BẢNG BIỂU và HÌNH ẢNH để trích xuất số liệu quan trọng).
Bóc tách thông tin BẮT BUỘC theo ĐÚNG định dạng JSON sau (không dùng markdown):

{
  "authors": "Tác giả",
  "year": "Năm xuất bản",
  "authorYear": "Tên tác giả và năm xuất bản (VD: Smith et al., 2023)",
  "title": "Tựa đề bài báo",
  "journal": "Tên tạp chí",
  "apa7": "Trích dẫn chuẩn APA 7th",
  "theory": "Tóm tắt Khung lý thuyết (Tiếng Việt)",
  "methodology": "Phương pháp nghiên cứu (Tiếng Việt)",
  "sampleSize": "Quy mô mẫu (Tiếng Việt)",
  "keyFindings": "Các kết quả chính (Bao gồm số liệu thống kê quan trọng) (Tiếng Việt)",
  "researchGap": "Khoảng trống nghiên cứu (Tiếng Việt)",
  "limitations": "Hạn chế nghiên cứu (Tiếng Việt)",
  "detailedFindings": [
    {
      "content": "Nội dung/Phát hiện cốt lõi số 1 (chi tiết, đầy đủ số liệu)",
      "location": "Trang X / Phần Y"
    },
    {
      "content": "Nội dung/Phát hiện cốt lõi số 2...",
      "location": "Trang Z / Phần W"
    }
  ],
  "originalQuote": "Một câu trích dẫn nguyên văn xuất sắc nhất (Tiếng Anh)",
  "translatedQuote": "Bản dịch tiếng Việt của câu trích dẫn trên",
  "references": ["Bài báo trích dẫn 1", "Bài báo trích dẫn 2"]
}
LƯU Ý: "detailedFindings" liệt kê tối đa 8 phát hiện quan trọng nhất (không cần liệt kê hết)."""

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=[pdf_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=_FAST_THINKING
            )
        )
        data = json.loads(response.text)
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data

    @retry(
        wait=wait_exponential(multiplier=5, min=15, max=60),
        stop=stop_after_attempt(5),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def format_raw_text(self, text: str) -> dict:
        # LƯU Ý: chuỗi này dùng .format(), nên MỌI dấu { } literal (khối JSON mẫu bên dưới)
        # phải escape thành {{ }} - chỉ có {text} là placeholder thật sự.
        prompt = """Bạn là một chuyên gia nghiên cứu học thuật xuất sắc. Nhiệm vụ của bạn là đọc ĐOẠN TÓM TẮT/TRÍCH XUẤT (đã được tạo ra từ NotebookLM) dưới đây và định dạng nó thành cấu trúc JSON chuẩn.

VĂN BẢN TRÍCH XUẤT TỪ NOTEBOOKLM:
---------------------
{text}
---------------------

Hãy điền thông tin vào định dạng JSON dưới đây. Nếu thông tin nào không có trong văn bản, hãy để trống "" hoặc [] nhưng KHÔNG được tự bịa ra.
{{
  "authors": "Tác giả",
  "year": "Năm xuất bản",
  "authorYear": "Tên tác giả và năm xuất bản (VD: Smith et al., 2023)",
  "title": "Tựa đề bài báo",
  "journal": "Tên tạp chí",
  "apa7": "Trích dẫn chuẩn APA 7th",
  "theory": "Tóm tắt Khung lý thuyết (Tiếng Việt)",
  "methodology": "Phương pháp nghiên cứu (Tiếng Việt)",
  "sampleSize": "Quy mô mẫu (Tiếng Việt)",
  "keyFindings": "Các kết quả chính (Bao gồm số liệu thống kê quan trọng) (Tiếng Việt)",
  "researchGap": "Khoảng trống nghiên cứu (Tiếng Việt)",
  "limitations": "Hạn chế nghiên cứu (Tiếng Việt)",
  "detailedFindings": [
    {{
      "content": "Nội dung/Phát hiện cốt lõi số 1 (chi tiết, đầy đủ số liệu)",
      "location": "Trang X / Phần Y"
    }},
    {{
      "content": "Nội dung/Phát hiện cốt lõi số 2...",
      "location": "Trang Z / Phần W"
    }}
  ],
  "originalQuote": "Một câu trích dẫn nguyên văn xuất sắc nhất (Tiếng Anh)",
  "translatedQuote": "Bản dịch tiếng Việt của câu trích dẫn trên",
  "references": ["Bài báo trích dẫn 1", "Bài báo trích dẫn 2"]
}}
LƯU Ý: "detailedFindings" liệt kê tối đa 8 phát hiện quan trọng nhất (không cần liệt kê hết)."""
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt.format(text=text),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=_FAST_THINKING
            )
        )
        data = json.loads(response.text)
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return data
