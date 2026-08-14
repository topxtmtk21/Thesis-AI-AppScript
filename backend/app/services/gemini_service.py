import json
from google import genai
from google.genai import types
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Tác vụ trích xuất/định dạng dữ liệu có cấu trúc không cần suy luận nhiều bước,
# nên hạ "thinking level" xuống thấp nhất để giảm đáng kể thời gian phản hồi.
_FAST_THINKING = types.ThinkingConfig(thinking_level="low")

# gemini-3.7-flash hỗ trợ cửa sổ ngữ cảnh 1M token. Giữ khoảng đệm rộng rãi cho phần
# prompt + JSON schema + output (tối đa 64k token) thay vì tính sát nút, ước lượng an
# toàn ~2 ký tự/token cho văn bản tiếng Việt => 500.000 ký tự vẫn còn dư nhiều so với
# giới hạn thật. Trước đây giới hạn 150.000 ký tự hay cắt mất phần cuối luận án dài
# (kết luận, tài liệu tham khảo).
_MAX_ANALYZE_TEXT_CHARS = 500_000


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
{text[:_MAX_ANALYZE_TEXT_CHARS]}
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

    def answer_question(self, prompt: str) -> str:
        # Trả lời hỏi-đáp có ngữ cảnh (RAG) - tác vụ cần phản hồi nhanh (chat), không cần
        # suy luận nhiều bước, nên cũng hạ xuống "low" giống các tác vụ trích xuất khác.
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(thinking_config=_FAST_THINKING)
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
        try:
            return self._analyze_uploaded_pdf(pdf_file)
        finally:
            # File upload lên Gemini File API chỉ dùng 1 lần cho request này - dọn ngay
            # sau khi xong, tránh tích tụ file mồ côi trong tài khoản theo thời gian.
            try:
                self.client.files.delete(name=pdf_file.name)
            except Exception:
                pass

    def _analyze_uploaded_pdf(self, pdf_file) -> dict:
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
    def analyze_news_framing(self, text: str, source_name: str = "", published_date: str = "") -> dict:
        prompt = f"""Bạn là một nhà nghiên cứu Báo chí học (Journalism Studies) giàu kinh nghiệm, chuyên phân tích khung tin tức (framing analysis).
Đọc kỹ bài báo tin tức dưới đây và phân tích theo các lý thuyết báo chí học kinh điển: Framing Theory, Agenda-Setting, Gatekeeping, Hostile Media Effect. Chỉ gọi tên lý thuyết khi thực sự phù hợp với nội dung, không gán ép.

Nguồn/Tòa soạn: {source_name or "Không rõ"}
Ngày đăng: {published_date or "Không rõ"}

Bóc tách thông tin BẮT BUỘC theo ĐÚNG định dạng JSON sau (không dùng markdown):
{{
  "dominant_frame": "Khung tin chủ đạo của bài báo (VD: khung xung đột, khung trách nhiệm, khung kinh tế...) và giải thích ngắn gọn",
  "tone": "Giọng điệu/thái độ chủ đạo của bài viết (trung lập, tích cực, tiêu cực, mỉa mai...)",
  "cited_sources": ["Nguồn tin/nhân vật được trích dẫn trong bài 1", "Nguồn tin 2"],
  "bias_indicators": "Các dấu hiệu thiên kiến nhận thấy được (lựa chọn từ ngữ, thiếu cân bằng nguồn tin, v.v.) hoặc 'Không rõ ràng' nếu không đủ căn cứ",
  "summary": "Tóm tắt ngắn gọn nội dung bài báo bằng tiếng Việt",
  "theory_notes": "Lý thuyết báo chí học phù hợp nhất để phân tích bài này và lý do (VD: 'Agenda-Setting - bài báo nhấn mạnh...')"
}}
--- BẮT ĐẦU BÀI BÁO ---
{text[:_MAX_ANALYZE_TEXT_CHARS]}
--- KẾT THÚC BÀI BÁO ---"""

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
    def compare_news_framing(self, articles: list) -> str:
        prompt = "Bạn là một nhà nghiên cứu Báo chí học chuyên phân tích so sánh khung tin tức (comparative framing analysis) giữa các tòa soạn.\n"
        prompt += "Các bài báo dưới đây viết về CÙNG một sự kiện/chủ đề, từ các nguồn khác nhau. Hãy so sánh: khung tin chủ đạo mỗi bài chọn, giọng điệu, nguồn tin được trích dẫn, điểm khác biệt/tương đồng trong cách đưa tin, và khả năng thiên kiến của từng nguồn. Dùng lý thuyết Framing/Agenda-Setting/Gatekeeping khi phù hợp.\n\n"
        for i, article in enumerate(articles):
            prompt += f"--- BÀI BÁO {i + 1} (Nguồn: {article.get('source', 'Không rõ')}) ---\n"
            prompt += article.get("text", "")[:_MAX_ANALYZE_TEXT_CHARS]
            prompt += "\n\n"

        # Giữ mức "thinking" mặc định (không hạ xuống "low"), cùng lý do với
        # synthesize_literature: đây là tác vụ so sánh/đối chiếu nhiều nguồn, cần suy
        # luận sâu hơn tác vụ trích xuất dữ liệu đơn thuần.
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
    def code_interview_transcript(self, transcript: str, interviewee_role: str = "") -> dict:
        prompt = f"""Bạn là một nhà nghiên cứu định tính giàu kinh nghiệm, chuyên mã hoá theo chủ đề (thematic coding) theo phương pháp Braun & Clarke cho phỏng vấn nghiên cứu Báo chí học.
Đọc kỹ transcript phỏng vấn dưới đây và mã hoá thành các chủ đề (theme) chính. Mỗi chủ đề PHẢI có ít nhất 1 trích dẫn nguyên văn minh hoạ từ transcript.

Vai trò người được phỏng vấn: {interviewee_role or "Không rõ"}

Bóc tách thông tin BẮT BUỘC theo ĐÚNG định dạng JSON sau (không dùng markdown):
{{
  "themes": [
    {{
      "theme": "Tên chủ đề 1",
      "description": "Mô tả chủ đề này bằng tiếng Việt",
      "supporting_quotes": ["Trích dẫn nguyên văn minh hoạ từ transcript"],
      "prevalence_note": "Ghi chú mức độ xuất hiện/nhấn mạnh của chủ đề này trong cuộc phỏng vấn"
    }}
  ],
  "overall_summary": "Tóm tắt tổng quan cuộc phỏng vấn bằng tiếng Việt"
}}
LƯU Ý: Liệt kê tối đa 8 chủ đề quan trọng nhất (không cần liệt kê hết).
--- BẮT ĐẦU TRANSCRIPT ---
{transcript[:_MAX_ANALYZE_TEXT_CHARS]}
--- KẾT THÚC TRANSCRIPT ---"""

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
