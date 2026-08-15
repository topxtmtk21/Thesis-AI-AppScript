# Thesis AI AppScript

Academic AI assistant for Google Sheets and a standalone FastAPI web dashboard. The system analyzes academic PDFs/text, stores searchable chunks in Pinecone, chats with the document collection, builds a knowledge graph, and supports journalism/interview research workflows.

## Main Pieces

- `Mã.js` and the root `*.html` files are the Google Apps Script source pushed by `clasp`.
- `frontend/` is the source web dashboard. `build_gas.py` bundles `frontend/index.html` and `frontend/app.js` into root `Index.html`.
- `backend/app/` is the FastAPI backend.
- `backend/tests/` covers the backend services and API routers.

## Backend Environment

Use `backend/.env.example` as the checklist for deployment variables.

- `BACKEND_SHARED_SECRET`: optional but recommended. When set, API requests must include `X-Backend-Secret`.
- `BACKEND_CORS_ORIGINS`: comma-separated allowed browser origins. For Apps Script use `https://script.google.com,https://script.googleusercontent.com`.
- `MAX_CONCURRENT_JOBS`: default `3`.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: required only for standalone web dashboard writes to Google Sheets.

Users still provide their own Gemini and Pinecone keys from the UI. Document vectors are isolated by `workspace_id`, which defaults to the active Spreadsheet ID.

## Local Verification

```powershell
$env:TEMP='D:\Thesis-AI-AppScript\.tmp'
$env:TMP='D:\Thesis-AI-AppScript\.tmp'
.\.venv\Scripts\python.exe -m pytest -o cache_dir=D:\Thesis-AI-AppScript\.tmp\pytest_cache
node --check frontend\app.js
node --check Mã.js
```

## Build And Sync Apps Script

```powershell
.\.venv\Scripts\python.exe build_gas.py
clasp push
```

After backend redeploy, open Google Sheets, run the app settings menu, and set:

- Backend URL
- Gemini API key
- Pinecone API key
- Backend secret, if `BACKEND_SHARED_SECRET` is enabled

## Deploy Backend

Render reads `render.yaml`. Cloud Run deploys from `.github/workflows/cloud-run.yml` on pushes to `main`; configure these GitHub secrets before relying on the workflow:

- `GCP_CREDENTIALS`
- `GCP_PROJECT_ID`
- `BACKEND_SHARED_SECRET`
- `BACKEND_CORS_ORIGINS`
