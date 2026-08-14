from pinecone import Pinecone, ServerlessSpec
from google import genai
import time
import uuid
from langchain_text_splitters import RecursiveCharacterTextSplitter
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
import json

class PineconeManager:
    def __init__(self, pinecone_api_key, gemini_api_key, index_name="academic-papers"):
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index_name = index_name
        self.client = genai.Client(api_key=gemini_api_key)
        
        # Kiểm tra và tạo index nếu chưa có
        if self.index_name not in self.pc.list_indexes().names():
            print(f"Đang tạo Pinecone index '{self.index_name}'...")
            self.pc.create_index(
                name=self.index_name,
                dimension=768, # Kích thước vector của mô hình Gemini text-embedding-004
                metric='cosine',
                spec=ServerlessSpec(cloud='aws', region='us-east-1')
            )
            # Chờ index được tạo xong
            while not self.pc.describe_index(self.index_name).status['ready']:
                time.sleep(1)
                
        self.index = self.pc.Index(self.index_name)

    @retry(
        wait=wait_exponential(multiplier=2, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception_type(Exception),
        reraise=True
    )
    def _get_embeddings_batch(self, texts, task_type="retrieval_document"):
        # Sử dụng Gemini để nhúng một batch văn bản (tối đa 100 chunk/request)
        response = self.client.models.embed_content(
            model="gemini-embedding-001",
            contents=texts,
            config={
                "task_type": task_type.upper() if task_type else None,
                "output_dimensionality": 768
            }
        )
        return [emb.values for emb in response.embeddings]
        
    def _get_embedding(self, text, task_type="retrieval_document"):
        return self._get_embeddings_batch([text], task_type)[0]

    def add_document(self, doc_data: dict):
        text = doc_data.get("text", "")
        if not text:
            return
            
        title = doc_data.get("filename", "Unknown")
        paper_id = str(uuid.uuid4())
        
        # Cắt nhỏ văn bản (Semantic Chunking)
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=8000,
            chunk_overlap=1000,
            length_function=len,
            is_separator_regex=False,
        )
        text_chunks = text_splitter.split_text(text)
        
        metadata_dict = {
            "filename": doc_data.get("filename", ""),
            "authors": doc_data.get("authors", ""),
            "year": doc_data.get("year", ""),
            "theory": doc_data.get("theory", ""),
            "methodology": doc_data.get("methodology", ""),
            "detailedFindings": json.dumps(doc_data.get("detailedFindings", []), ensure_ascii=False)
        }
            
        vectors = []
        
        # Chia text_chunks thành các batch (mỗi batch 50 chunk để vừa Pinecone và Gemini limit)
        batch_size = 50
        for i in range(0, len(text_chunks), batch_size):
            batch_chunks = text_chunks[i:i+batch_size]
            
            # Lấy vector cho cả batch bằng 1 request duy nhất!
            embeddings = self._get_embeddings_batch(batch_chunks)
            
            batch_vectors = []
            for j, chunk in enumerate(batch_chunks):
                chunk_index = i + j
                vector_id = f"{paper_id}_chunk_{chunk_index}"
                
                meta = {"title": title, "chunk_index": chunk_index, "text": chunk}
                meta.update(metadata_dict)
                
                batch_vectors.append({
                    "id": vector_id,
                    "values": embeddings[j],
                    "metadata": meta
                })
                
            self.index.upsert(vectors=batch_vectors)
            time.sleep(1) # Nghỉ một chút giữa các batch để an toàn
            vectors.extend(batch_vectors)
            
        print(f"Đã lưu vector lên Pinecone cho bài báo: {title} ({len(text_chunks)} chunks)")
        return paper_id

    def search(self, query_text, top_k=5, filename=None):
        # Chuyển câu hỏi thành Vector
        query_vector = self._get_embedding(query_text, task_type="retrieval_query")
        
        # Truy vấn Pinecone
        query_params = {
            "vector": query_vector,
            "top_k": top_k,
            "include_metadata": True
        }
        
        if filename:
            query_params["filter"] = {"filename": {"$eq": filename}}
            
        response = self.index.query(**query_params)
        
        return response

    def check_document_exists(self, filename: str) -> bool:
        try:
            # Query with a dummy vector but filter by filename
            dummy_vector = [0.0] * 768
            response = self.index.query(
                vector=dummy_vector,
                top_k=1,
                filter={"filename": {"$eq": filename}},
                include_metadata=False
            )
            return len(response['matches']) > 0
        except Exception as e:
            print("Lỗi khi kiểm tra trùng lặp Pinecone:", e)
            return False

    def get_all_documents(self):
        # Truy vấn ngẫu nhiên để lấy danh sách bài báo (giới hạn 5000 chunks)
        dummy_vector = [0.0] * 768
        try:
            response = self.index.query(
                vector=dummy_vector,
                top_k=5000,
                include_metadata=True
            )
            
            docs = {}
            for match in response['matches']:
                meta = match['metadata']
                title = meta.get("title", "Unknown")
                if title not in docs:
                    detailed_findings = []
                    try:
                        detailed_findings = json.loads(meta.get("detailedFindings", "[]"))
                    except:
                        pass
                        
                    docs[title] = {
                        "title": title,
                        "author": meta.get("author", "N/A"),
                        "theory": meta.get("theory", "N/A"),
                        "methodology": meta.get("methodology", "N/A"),
                        "detailedFindings": detailed_findings,
                        "chunks": 0
                    }
                docs[title]["chunks"] += 1
                
            return list(docs.values())
        except Exception as e:
            print("Lỗi khi lấy tài liệu từ Pinecone:", e)
            return []
