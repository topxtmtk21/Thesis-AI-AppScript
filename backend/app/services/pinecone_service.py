from pinecone import Pinecone, ServerlessSpec
import google.generativeai as genai
import time
import uuid
from langchain_text_splitters import RecursiveCharacterTextSplitter

class PineconeManager:
    def __init__(self, pinecone_api_key, gemini_api_key, index_name="academic-papers"):
        self.pc = Pinecone(api_key=pinecone_api_key)
        self.index_name = index_name
        genai.configure(api_key=gemini_api_key)
        
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

    def _get_embedding(self, text, task_type="retrieval_document"):
        # Sử dụng Gemini để nhúng văn bản
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type=task_type
        )
        return result['embedding']

    def add_document(self, doc_data: dict):
        text = doc_data.get("text", "")
        if not text:
            return
            
        title = doc_data.get("filename", "Unknown")
        paper_id = str(uuid.uuid4())
        
        # Cắt nhỏ văn bản (Semantic Chunking)
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            is_separator_regex=False,
        )
        text_chunks = text_splitter.split_text(text)
        
        metadata_dict = {
            "filename": doc_data.get("filename", ""),
            "authors": doc_data.get("authors", ""),
            "year": doc_data.get("year", ""),
            "theory": doc_data.get("theory", ""),
            "methodology": doc_data.get("methodology", "")
        }
            
        vectors = []
        for i, chunk in enumerate(text_chunks):
            vector_id = f"{paper_id}_chunk_{i}"
            embedding = self._get_embedding(chunk)
            
            # Lưu cả nội dung text vào metadata để lúc truy vấn có cái đọc
            meta = {"title": title, "chunk_index": i, "text": chunk}
            meta.update(metadata_dict)
            
            vectors.append({
                "id": vector_id,
                "values": embedding,
                "metadata": meta
            })
            
            # Gửi lên Pinecone mỗi 50 chunk để tránh quá tải
            if len(vectors) >= 50:
                self.index.upsert(vectors=vectors)
                vectors = []
                time.sleep(0.5)
                
        if len(vectors) > 0:
            self.index.upsert(vectors=vectors)
            
        print(f"Đã lưu vector lên Pinecone cho bài báo: {title} ({len(text_chunks)} chunks)")
        return paper_id

    def search(self, query_text, top_k=5):
        # Chuyển câu hỏi thành Vector
        query_vector = self._get_embedding(query_text, task_type="retrieval_query")
        
        # Truy vấn Pinecone
        response = self.index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True
        )
        
        return response

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
                    docs[title] = {
                        "title": title,
                        "author": meta.get("author", "N/A"),
                        "theory": meta.get("theory", "N/A"),
                        "methodology": meta.get("methodology", "N/A"),
                        "chunks": 0
                    }
                docs[title]["chunks"] += 1
                
            return list(docs.values())
        except Exception as e:
            print("Lỗi khi lấy tài liệu từ Pinecone:", e)
            return []
