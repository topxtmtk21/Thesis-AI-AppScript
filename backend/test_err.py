import sys
import io
import traceback
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, raise_server_exceptions=True)

pdf = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n188\n%%EOF'

try:
    response = client.post('/api/analyze-pdf-blob', files={'file': ('dummy.pdf', io.BytesIO(pdf), 'application/pdf')}, data={'api_key':'test', 'pinecone_api_key':'test'})
    print("STATUS", response.status_code)
except Exception as e:
    traceback.print_exc()
