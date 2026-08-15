// Network requests occasionally hit a sleeping hosting instance or a transient
// upstream overload. Keep one retry policy for the whole web app so every device
// gets the same timeout and recovery behavior.
const nativeFetch = window.fetch.bind(window);
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function makeRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function resilientFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const isJobSubmission = /\/api\/jobs\/analyze-(text|pdf)/.test(url);
    const mayRetry = method === 'GET' || method === 'HEAD' || isJobSubmission || !url.includes('/api/sheets/append-row');
    const headers = new Headers(init.headers || {});
    headers.set('X-Request-ID', headers.get('X-Request-ID') || makeRequestId());
    if (isJobSubmission && !headers.has('Idempotency-Key')) {
        headers.set('Idempotency-Key', makeRequestId());
    }

    const attempts = mayRetry ? 4 : 1;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
            const response = await nativeFetch(input, { ...init, headers, signal: controller.signal });
            if (!RETRYABLE_HTTP_STATUS.has(response.status) || attempt === attempts - 1) return response;
            const retryAfter = Number(response.headers.get('Retry-After')) * 1000;
            const delay = retryAfter || Math.min(12000, 1000 * (2 ** attempt)) + Math.random() * 500;
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            lastError = error;
            if (attempt === attempts - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.min(12000, 1000 * (2 ** attempt)) + Math.random() * 500));
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError || new Error('Request failed');
}

window.fetch = resilientFetch;

// Tab Switching
function switchTab(tabId, navEl) {
    // Update active nav link
    document.querySelectorAll('.nav-item').forEach(li => li.classList.remove('active'));
    if (navEl) navEl.classList.add('active');

    // Update title
    const titles = {
        'documents': 'Kho Dữ Liệu',
        'upload': 'Tải PDF Lên',
        'notebooklm': 'Dán từ NotebookLM',
        'graph': 'Knowledge Graph',
        'timeline': 'Timeline Nghiên cứu',
        'news': 'Phân tích Khung Tin tức',
        'interview': 'Mã hoá Phỏng vấn',
        'kappa': 'Độ tin cậy Mã hoá'
    };
    document.getElementById('page-title').innerText = titles[tabId] || 'Dashboard';

    // Show selected view
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('view-' + tabId).classList.add('active');

    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");

    if (tabId === 'graph') {
        // Reload frame to ensure physics engine starts properly
        const frame = document.getElementById('graph-frame');
        frame.src = frame.src;
    } else if (tabId === 'timeline') {
        const frame = document.getElementById('timeline-frame');
        if (backendUrl) frame.src = `${backendUrl}/api/timeline`;
    } else if (tabId === 'news') {
        loadNewsHistory();
    } else if (tabId === 'interview') {
        loadInterviewHistory();
    }
}

// Tài liệu vừa tải về từ Backend, giữ lại ở client để lọc/tìm kiếm không cần gọi lại API
let allLoadedDocuments = [];

// Fetch Documents
async function loadDocuments() {
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    const pineconeKey = document.getElementById('global-pinecone-key').value.trim();
    const tbody = document.getElementById('docs-body');

    if (!geminiKey || !pineconeKey || !backendUrl) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #f87171;">Vui lòng nhập đủ Backend URL, Gemini Key và Pinecone Key ở góc trên phải rồi nhấn Load.</td></tr>';
        return;
    }
    saveConfigToLocal(backendUrl, geminiKey, pineconeKey);

    try {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Đang tải dữ liệu...</td></tr>';

        const params = new URLSearchParams({
            api_key: geminiKey,
            pinecone_api_key: pineconeKey,
            workspace_id: getWorkspaceId()
        });

        const response = await fetch(`${backendUrl}/api/documents?` + params.toString(), {
            headers: getBackendHeaders()
        });
        const data = await response.json();

        allLoadedDocuments = (data.status === 'success') ? data.documents : [];
        const searchInput = document.getElementById('doc-search');
        if (searchInput) searchInput.value = '';
        renderDocumentsTable(allLoadedDocuments);
    } catch (error) {
        console.error('Error fetching docs:', error);
        document.getElementById('docs-body').innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-red-400"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Lỗi kết nối Backend.</td></tr>';
    }
}

// Phân trang phía client - bảng không phân trang sẽ render hết vào 1 lần, chậm dần khi
// kho tài liệu lên tới hàng trăm dòng.
const DOCS_PAGE_SIZE = 20;
let currentDocsView = [];
let currentDocsPage = 1;

function renderDocumentsTable(docs) {
    currentDocsView = docs || [];
    currentDocsPage = 1;
    renderCurrentDocsPage();
}

function renderCurrentDocsPage() {
    const tbody = document.getElementById('docs-body');
    const paginationBar = document.getElementById('docs-pagination');
    const totalItems = currentDocsView.length;

    if (totalItems === 0) {
        const message = allLoadedDocuments.length === 0
            ? 'Chưa có tài liệu nào trong cơ sở dữ liệu.'
            : 'Không tìm thấy tài liệu nào khớp với từ khoá tìm kiếm.';
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400">${message}</td></tr>`;
        paginationBar.classList.add('hidden');
        return;
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / DOCS_PAGE_SIZE));
    currentDocsPage = Math.min(Math.max(1, currentDocsPage), totalPages);
    const start = (currentDocsPage - 1) * DOCS_PAGE_SIZE;
    const pageDocs = currentDocsView.slice(start, start + DOCS_PAGE_SIZE);

    tbody.innerHTML = '';
    pageDocs.forEach(doc => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/5 transition-colors group";
        tr.innerHTML = `
            <td class="px-6 py-4 border-b border-white/10 text-center">
                <input type="checkbox" class="doc-checkbox w-4 h-4 rounded border-slate-600 bg-dark-700 accent-brand-500 cursor-pointer" value='${JSON.stringify(doc).replace(/'/g, "&apos;")}'>
            </td>
            <td class="px-6 py-4 border-b border-white/10">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-file-pdf text-red-400"></i>
                    </div>
                    <span class="font-medium text-slate-200 truncate max-w-[200px] block" title="${doc.filename || 'Unknown'}">${doc.filename || 'Unknown'}</span>
                </div>
            </td>
            <td class="px-6 py-4 border-b border-white/10 text-slate-300">${doc.authors || doc.author || 'Unknown'}</td>
            <td class="px-6 py-4 border-b border-white/10 text-slate-300 truncate max-w-xs" title="${doc.title || 'Unknown'}">${doc.title || 'Unknown'}</td>
            <td class="px-6 py-4 border-b border-white/10 text-slate-300 truncate max-w-[150px]" title="${doc.methodology || 'Unknown'}">${doc.methodology || 'Unknown'}</td>
            <td class="px-6 py-4 border-b border-white/10 text-center">
                <button class="px-4 py-1.5 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500 hover:text-white text-sm font-medium transition-all opacity-70 group-hover:opacity-100 border border-brand-500/30" onclick="viewDoc('${doc.id}')">Xem</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('docs-pagination-info').textContent =
        `Hiển thị ${start + 1}-${Math.min(start + DOCS_PAGE_SIZE, totalItems)} / ${totalItems} tài liệu (trang ${currentDocsPage}/${totalPages})`;
    document.getElementById('docs-prev-page').disabled = currentDocsPage <= 1;
    document.getElementById('docs-next-page').disabled = currentDocsPage >= totalPages;
    paginationBar.classList.remove('hidden');
}

function changeDocPage(delta) {
    currentDocsPage += delta;
    renderCurrentDocsPage();
}

// Lọc danh sách đã tải theo tên file/tác giả/tựa đề/phương pháp - lọc phía client,
// không gọi lại Backend vì toàn bộ danh sách đã có sẵn trong allLoadedDocuments.
function filterDocuments() {
    const query = document.getElementById('doc-search').value.trim().toLowerCase();
    if (!query) {
        renderDocumentsTable(allLoadedDocuments);
        return;
    }
    const filtered = allLoadedDocuments.filter(doc => {
        const haystack = [doc.filename, doc.authors, doc.author, doc.title, doc.methodology, doc.theory]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(query);
    });
    renderDocumentsTable(filtered);
}

// Chatbot Logic
function toggleChat() {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.classList.toggle('active');
}

function appendMessage(sender, text) {
    const history = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    // simple html format for markdown
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\n/g, '<br>');
    msgDiv.innerHTML = formattedText;
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
    return msgDiv;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    const pineconeKey = document.getElementById('global-pinecone-key').value.trim();
    
    const text = input.value.trim();

    if (!text) return;
    if (!geminiKey || !pineconeKey || !backendUrl) {
        showToast("Vui lòng nhập đủ thông tin trong phần Cài đặt.", "warning");
        return;
    }
    saveConfigToLocal(backendUrl, geminiKey, pineconeKey);

    appendMessage('user', text);
    input.value = '';
    
    // Add loading message
    const loadingMsg = appendMessage('bot', '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang suy nghĩ...');

    try {
        const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ 
                question: text, 
                api_key: geminiKey,
                pinecone_api_key: pineconeKey,
                workspace_id: getWorkspaceId()
            })
        });
        
        const data = await response.json();
        
        // Remove loading
        loadingMsg.remove();
        
        if (response.ok && data.status === 'success') {
            appendMessage('bot', data.answer);
        } else {
            appendMessage('bot', '❌ Lỗi: ' + (data.detail || 'Không xác định'));
        }
    } catch (error) {
        loadingMsg.remove();
        appendMessage('bot', '❌ Lỗi kết nối mạng.');
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Không tự loadDocuments nữa
    const tbody = document.getElementById('docs-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Vui lòng nhập API Key trong phần Cài đặt.</td></tr>';
    
    // Nạp lại cấu hình từ Local Storage
    let savedBackend = localStorage.getItem('backend_url');
    const savedGemini = localStorage.getItem('gemini_key');
    const savedPinecone = localStorage.getItem('pinecone_key');
    const savedSecret = localStorage.getItem('backend_secret');
    let savedSpreadsheetId = localStorage.getItem('spreadsheet_id');

    if (!savedBackend && /^https?:$/.test(window.location.protocol)) {
        savedBackend = window.location.origin;
        localStorage.setItem('backend_url', savedBackend);
    }
    const spreadsheetFromUrl = normalizeSpreadsheetId(
        new URLSearchParams(window.location.search).get('spreadsheet_id') ||
        new URLSearchParams(window.location.search).get('sheet') || ''
    );
    if (spreadsheetFromUrl) {
        savedSpreadsheetId = spreadsheetFromUrl;
        localStorage.setItem('spreadsheet_id', spreadsheetFromUrl);
    }

    if (savedBackend) document.getElementById('global-backend-url').value = savedBackend;
    if (savedGemini) document.getElementById('global-gemini-key').value = savedGemini;
    if (savedPinecone) document.getElementById('global-pinecone-key').value = savedPinecone;
    if (savedSecret) document.getElementById('global-backend-secret').value = savedSecret;
    if (savedSpreadsheetId) document.getElementById('global-spreadsheet-id').value = savedSpreadsheetId;

    // Đồng bộ chiều Sheets -> Web App: chỉ khả dụng khi mở qua Apps Script. Field nào
    // localStorage CHƯA có mới nạp từ Sheets (localStorage ưu tiên vì người dùng có thể
    // đã tự sửa tay trên trình duyệt đó; Sheets chỉ là giá trị mặc định cho lần đầu mở
    // Web App trên máy/trình duyệt mới).
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler((cfg) => {
            if (!cfg) return;
            if (!savedBackend && cfg.backendUrl) { document.getElementById('global-backend-url').value = cfg.backendUrl; }
            if (!savedGemini && cfg.geminiKey) { document.getElementById('global-gemini-key').value = cfg.geminiKey; }
            if (!savedPinecone && cfg.pineconeKey) { document.getElementById('global-pinecone-key').value = cfg.pineconeKey; }
            if (!savedSecret && cfg.backendSecret) { document.getElementById('global-backend-secret').value = cfg.backendSecret; }
            if (!savedSpreadsheetId && cfg.spreadsheetId) { document.getElementById('global-spreadsheet-id').value = cfg.spreadsheetId; }
            saveConfigToLocal(cfg.backendUrl, cfg.geminiKey, cfg.pineconeKey, cfg.backendSecret, cfg.spreadsheetId);
        }).getStoredConfig();
    }
});

function saveConfigToLocal(backendUrl, geminiKey, pineconeKey, backendSecret, spreadsheetId) {
    if (backendUrl) localStorage.setItem('backend_url', backendUrl);
    if (geminiKey) localStorage.setItem('gemini_key', geminiKey);
    if (pineconeKey) localStorage.setItem('pinecone_key', pineconeKey);
    if (backendSecret) localStorage.setItem('backend_secret', backendSecret);
    if (spreadsheetId !== undefined) {
        const normalizedId = normalizeSpreadsheetId(spreadsheetId);
        if (normalizedId) localStorage.setItem('spreadsheet_id', normalizedId);
        else localStorage.removeItem('spreadsheet_id');
    }
}

function normalizeSpreadsheetId(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const candidate = urlMatch ? urlMatch[1] : input;
    return /^[a-zA-Z0-9_-]{20,}$/.test(candidate) ? candidate : '';
}

function getSpreadsheetId() {
    return localStorage.getItem('spreadsheet_id') || '';
}

function getWorkspaceId() {
    return getSpreadsheetId() || localStorage.getItem('workspace_id') || 'default';
}

// Header dùng chung cho mọi fetch() tới Backend: thêm X-Backend-Secret nếu người dùng
// đã cấu hình (Backend chỉ kiểm tra header này khi có bật BACKEND_SHARED_SECRET, nên
// không cấu hình gì thì hành vi vẫn như cũ).
function getBackendHeaders(extra) {
    const secret = localStorage.getItem('backend_secret');
    const headers = Object.assign({ 'ngrok-skip-browser-warning': '69420' }, extra || {});
    if (secret) headers['X-Backend-Secret'] = secret;
    return headers;
}

// Modal & Toast Logic
function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
}

async function saveSettings() {
    const backend = document.getElementById('global-backend-url').value.trim();
    const gemini = document.getElementById('global-gemini-key').value.trim();
    const pinecone = document.getElementById('global-pinecone-key').value.trim();
    const backendSecret = document.getElementById('global-backend-secret').value.trim();
    const spreadsheetInput = document.getElementById('global-spreadsheet-id');
    const spreadsheetId = normalizeSpreadsheetId(spreadsheetInput.value);

    if (spreadsheetInput.value.trim() && !spreadsheetId) {
        showToast("URL hoặc Spreadsheet ID không hợp lệ.", "error");
        spreadsheetInput.focus();
        return;
    }

    const isStandalone = !(typeof google !== 'undefined' && google.script && google.script.run);
    if (isStandalone && !spreadsheetId) {
        showToast("Google Sheet đích là bắt buộc khi chạy trên Render.", "error");
        spreadsheetInput.focus();
        return;
    }

    if (isStandalone) {
        try {
            const validationHeaders = getBackendHeaders();
            if (backendSecret) validationHeaders['X-Backend-Secret'] = backendSecret;
            const response = await fetch(`${backend.replace(/\/$/, "")}/api/sheets/status?spreadsheet_id=${encodeURIComponent(spreadsheetId)}`, {
                headers: validationHeaders
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || "Backend không truy cập được Google Sheet.");
        } catch (error) {
            showToast(`Không thể kết nối Google Sheet: ${error.message}`, "error");
            spreadsheetInput.focus();
            return;
        }
    }

    saveConfigToLocal(backend, gemini, pinecone, backendSecret, spreadsheetId);
    spreadsheetInput.value = spreadsheetId;

    // Đồng bộ cấu hình sang Google Sheets
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(() => {
            console.log("Synced to Sheets");
        }).saveConfigToProperties(backend, gemini, pinecone, backendSecret, spreadsheetId);
    }

    closeSettings();
    showToast("Đã lưu cấu hình thành công!", "success");
}

function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : 
                 type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info';
                 
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Select All Toggle
function toggleSelectAll() {
    const selectAll = document.getElementById('select-all').checked;
    const checkboxes = document.querySelectorAll('.doc-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll);
}

// Get Selected Documents
function getSelectedDocuments() {
    const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
    const docs = [];
    checkboxes.forEach(cb => {
        try {
            docs.push(JSON.parse(cb.value));
        } catch(e) {}
    });
    return docs;
}

// Export Documents
async function exportDocs(format) {
    const docs = getSelectedDocuments();
    if (docs.length === 0) {
        showToast("Vui lòng chọn ít nhất 1 tài liệu để tải xuống.", "warning");
        return;
    }
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    if (!backendUrl) return showToast("Vui lòng nhập Backend URL trong phần Cài đặt", "warning");

    try {
        showToast(`Đang tải file ${format.toUpperCase()}...`, "warning");
        const response = await fetch(`${backendUrl}/api/export`, {
            method: 'POST',
            headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ format: format, documents: docs })
        });
        
        if (!response.ok) throw new Error("Lỗi tải file");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported_documents.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    }
}

// Export RIS (Zotero)
async function exportRis() {
    const docs = getSelectedDocuments();
    if (docs.length === 0) {
        showToast("Vui lòng chọn ít nhất 1 tài liệu để tải xuống.", "warning");
        return;
    }
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    if (!backendUrl) return showToast("Vui lòng nhập Backend URL trong phần Cài đặt", "warning");

    let risContent = "";
    showToast(`Đang tải file RIS...`, "warning");
    for (const doc of docs) {
        const res = await fetch(`${backendUrl}/api/export-ris`, {
            method: 'POST',
            headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                authors: doc.authors || doc.author || "Unknown",
                year: doc.year || "",
                title: doc.title || doc.filename || "Unknown",
                journal: doc.journal || "",
                volume: doc.volume || "",
                issue: doc.issue || "",
                pages: doc.pages || "",
                doi: doc.doi || ""
            })
        });
        const data = await res.json();
        if (data.status === 'success') {
            risContent += data.ris + "\n";
        }
    }

    if (risContent) {
        const blob = new Blob([risContent], { type: 'application/x-research-info-systems' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "citations.ris";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

// Upload Handling
function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) uploadFile(files[0]);
}

function handleDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        if (files[0].type === "application/pdf") {
            uploadFile(files[0]);
        } else {
            showToast("Vui lòng chỉ tải lên file PDF.", "error");
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadFile(file) {
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    const pineconeKey = document.getElementById('global-pinecone-key').value.trim();

    if (!backendUrl || !geminiKey || !pineconeKey) {
        showToast("Vui lòng nhập đủ thông tin trong phần Cài đặt!", "warning");
        return;
    }
    saveConfigToLocal(backendUrl, geminiKey, pineconeKey);

    const statusDiv = document.getElementById('upload-status');
    statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", geminiKey);
    formData.append("pinecone_api_key", pineconeKey);
    formData.append("workspace_id", getWorkspaceId());
    const spreadsheetId = getSpreadsheetId();
    if (spreadsheetId) formData.append("spreadsheet_id", spreadsheetId);

    // Gửi job rồi hỏi lại định kỳ thay vì giữ 1 request duy nhất chờ suốt quá trình
    // Gemini phân tích + lưu Pinecone (có thể mất vài phút và dễ bị timeout ở tầng hosting).
    try {
        const submitResponse = await fetch(`${backendUrl}/api/jobs/analyze-pdf`, {
            method: 'POST',
            headers: getBackendHeaders(),
            body: formData
        });

        if (!submitResponse.ok) {
            const data = await submitResponse.json().catch(() => ({}));
            statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi: ${data.detail || "Không thể gửi file"}`;
            return;
        }

        const { job_id } = await submitResponse.json();
        statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích ${file.name} (có thể mất vài phút)...`;

        const maxAttempts = 120; // tối đa ~10 phút (poll mỗi 5s)
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await sleep(5000);

            const pollResponse = await fetch(`${backendUrl}/api/jobs/${job_id}`, {
                headers: getBackendHeaders()
            });

            if (pollResponse.status === 404) {
                statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Job đã mất (Backend có thể vừa khởi động lại). Vui lòng thử lại.`;
                return;
            }

            const job = await pollResponse.json();
            if (job.status === 'success') {
                statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> Đã phân tích xong "${job.data?.title || file.name}"!`;
                showToast("Phân tích thành công! Xem kết quả ở tab Kho Dữ Liệu.", "success");
                loadDocuments();
                return;
            }
            if (job.status === 'error') {
                statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi: ${job.error || "Không thể xử lý"}`;
                return;
            }
            // status === 'pending' -> tiếp tục vòng lặp
        }

        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Quá thời gian chờ. Việc phân tích vẫn có thể đang chạy ở Backend, hãy kiểm tra lại tab Kho Dữ Liệu sau ít phút.`;
    } catch (e) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi kết nối: ${e.message}`;
    }
}

async function processNotebookLMWeb() {
    const text = document.getElementById('notebooklm-input').value.trim();
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    const statusDiv = document.getElementById('notebooklm-status');

    if (!text) {
        showToast("Vui lòng dán văn bản từ NotebookLM", "warning");
        return;
    }
    if (!geminiKey) {
        showToast("Vui lòng nhập Gemini API Key trong phần Cài đặt ở góc phải trên cùng", "error");
        return;
    }

    const isStandalone = !(typeof google !== 'undefined' && google.script && google.script.run);
    if (isStandalone && !getSpreadsheetId()) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i> Hãy cấu hình Google Sheet đích trước khi xử lý.`;
        openSettings();
        showToast("Dán URL Google Sheet vào Cài đặt và bấm Lưu.", "warning");
        document.getElementById('global-spreadsheet-id').focus();
        return;
    }
    
    statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gọi trực tiếp Google Gemini từ trình duyệt (Siêu tốc)...`;
    
    const prompt = `Bạn là một trợ lý nghiên cứu học thuật chuyên nghiệp. Hãy đọc kỹ tài liệu này và trích xuất thông tin theo đúng cấu trúc dưới đây bằng Tiếng Việt (trừ những chỗ có yêu cầu dùng Tiếng Anh). 

YÊU CẦU BẮT BUỘC (QUAN TRỌNG NHẤT): 
Đối với mọi thông tin bạn trích xuất, bạn PHẢI đính kèm vị trí chính xác của thông tin đó trong ngoặc đơn ở cuối mỗi câu hoặc mỗi đoạn.
- Nếu tài liệu có số trang: Ghi rõ số trang (VD: tr. 15, tr. 20-22). TUYỆT ĐỐI dùng chữ "tr." thay cho chữ "p.".
- Nếu tài liệu không có số trang (HTML/Web): Ghi rõ tên Mục/Tiêu đề phần (VD: Mục Methodology, Đoạn 3 phần Discussion).
Tuyệt đối không tự bịa thông tin, nếu tài liệu không có hãy ghi "Không đề cập".

VĂN BẢN TRÍCH XUẤT TỪ NOTEBOOKLM:
---------------------
${text}
---------------------

Hãy điền thông tin vào định dạng JSON dưới đây. Nếu thông tin nào không có trong văn bản, hãy để trống "" hoặc [] nhưng KHÔNG được tự bịa ra.
{
  "authors": "Tác giả",
  "year": "Năm xuất bản",
  "authorYear": "Tên tác giả và năm xuất bản (VD: Smith et al., 2023)",
  "title": "Tựa đề bài báo (Giữ nguyên Tiếng Anh)",
  "journal": "Tên tạp chí/Hội nghị",
  "apa7": "Trích dẫn chuẩn xác theo APA 7",
  "theory": "Tóm tắt ngắn gọn lý thuyết nền tảng. BẮT BUỘC ghi rõ trang/phần",
  "methodology": "Định lượng, định tính, hay hỗn hợp? Các công cụ phân tích là gì? BẮT BUỘC ghi rõ trang/phần",
  "sampleSize": "Mô tả chi tiết số lượng, đối tượng, cách thức lấy mẫu. BẮT BUỘC ghi rõ trang/phần",
  "keyFindings": "Liệt kê các kết quả quan trọng nhất, kèm số liệu thống kê nếu có. Mỗi kết quả BẮT BUỘC ghi rõ trang/phần",
  "researchGap": "Bài báo này lấp đầy khoảng trống nào của các nghiên cứu đi trước? BẮT BUỘC ghi rõ trang/phần",
  "limitations": "Tác giả tự nhận định những hạn chế nào? BẮT BUỘC ghi rõ trang/phần",
  "detailedFindings": [
    {
      "content": "Nội dung phát hiện chuyên sâu... (Copy NGUYÊN VĂN từ văn bản nếu có)",
      "location": "Trang X / Phần Y"
    },
    {
      "content": "Nội dung phát hiện chuyên sâu số 2...",
      "location": "Trang Z / Phần W"
    }
  ],
  "originalQuote": "Copy NGUYÊN VĂN Tiếng Anh một câu/đoạn xuất sắc nhất. Ghi chính xác số trang/phần",
  "translatedQuote": "Bản dịch câu trên sang Tiếng Việt mang văn phong học thuật"
}
LƯU Ý: "detailedFindings" liệt kê tối đa 8 phát hiện quan trọng nhất (không cần liệt kê hết).`;

    // "thinkingLevel: low" giúp Gemini trả lời nhanh hơn đáng kể cho tác vụ trích xuất dữ liệu
    // có cấu trúc như thế này (không cần suy luận nhiều bước).
    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "low" }
        }
    };

    try {
        let response;
        let data;
        let retries = 6;
        let backoff = 3000;
        
        while (retries > 0) {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            data = await response.json();

            if (response.ok) {
                break; // Success
            } else if (response.status === 503 || response.status === 429) {
                retries--;
                if (retries === 0) throw new Error(data.error?.message || "Lỗi không xác định từ Gemini API.");
                
                statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Server Gemini quá tải (503). Đang tự động thử lại lần thứ ${7-retries}...`;
                await new Promise(r => setTimeout(r, backoff));
                backoff *= 2;
            } else {
                throw new Error(data.error?.message || "Lỗi không xác định từ Gemini API.");
            }
        }

        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("Không có dữ liệu trả về từ Gemini. Có thể do chính sách an toàn (Safety Settings).");
        }

        const rawContent = data.candidates[0].content?.parts?.[0]?.text;
        if (!rawContent) {
            throw new Error("Dữ liệu trả về bị rỗng.");
        }

        let result;
        try {
            result = JSON.parse(rawContent);
        } catch(e) {
            const cleaned = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
            try {
                result = JSON.parse(cleaned);
            } catch (e2) {
                throw new Error(`Không thể parse JSON từ phản hồi: ${cleaned.substring(0, 100)}...`);
            }
        }

        if (Array.isArray(result) && result.length > 0) {
            result = result[0];
        }

        statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang ghi dữ liệu vào Sheet...`;

        if (typeof google !== 'undefined' && google.script && google.script.run) {
            google.script.run
                .withSuccessHandler(function(res) {
                    statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> Trích xuất và lưu thành công! Bảng tính đã được cập nhật.`;
                    document.getElementById('notebooklm-input').value = ""; // Clear input
                    showToast("Đã lưu thành công vào Sheet!", "success");
                })
                .withFailureHandler(function(error) {
                    statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi ghi vào Sheet: ${error.message}`;
                    showToast("Lỗi xử lý. Vui lòng xem thông báo bên dưới nút bấm.", "error");
                })
                .appendNotebookLMRow(result);
            return;
        }

        // Chạy độc lập (không qua Apps Script): ghi vào Sheet thật qua Backend (Service
        // Account) nếu đã cấu hình Spreadsheet ID, còn không thì chỉ cảnh báo như trước.
        const spreadsheetId = getSpreadsheetId();
        const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
        if (!spreadsheetId || !backendUrl) {
            statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i> Cảnh báo: bạn đang chạy độc lập (không qua Apps Script) và chưa nhập Spreadsheet ID trong Cài đặt, nên không thể lưu vào Sheet.`;
            return;
        }
        try {
            const sheetResponse = await fetch(`${backendUrl}/api/sheets/append-row`, {
                method: 'POST',
                headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    spreadsheet_id: spreadsheetId,
                    source: "Dán từ NotebookLM (Web App)",
                    method: "Dán văn bản (NotebookLM)",
                    filename: "",
                    result: result,
                    workspace_id: getWorkspaceId()
                })
            });
            const sheetData = await sheetResponse.json();
            if (!sheetResponse.ok || sheetData.status !== 'success') throw new Error(sheetData.detail || "Lỗi không xác định.");
            statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> Trích xuất và lưu thành công! Bảng tính đã được cập nhật.`;
            document.getElementById('notebooklm-input').value = "";
            showToast("Đã lưu thành công vào Sheet!", "success");
        } catch (sheetError) {
            statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi ghi vào Sheet: ${sheetError.message}`;
            showToast("Lỗi xử lý. Vui lòng xem thông báo bên dưới nút bấm.", "error");
        }

    } catch (error) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi: ${error.message}`;
        showToast("Lỗi xử lý. Vui lòng xem thông báo bên dưới nút bấm.", "error");
    }
}

// =================================================================
// 📄 BÁO CÁO (dùng chung cho Literature Review & So sánh Khung Tin tức)
// =================================================================
let currentReportText = "";
let currentReportFilename = "report.md";

function openReportModal(title, text, filename) {
    currentReportText = text;
    currentReportFilename = filename || "report.md";
    document.getElementById('report-modal-title').textContent = title;
    document.getElementById('report-modal-body').textContent = text;
    document.getElementById('report-modal').classList.add('active');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.remove('active');
}

function downloadReportModal() {
    const blob = new Blob([currentReportText], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentReportFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// =================================================================
// 🧠 TỔNG HỢP LITERATURE REVIEW (MATRIX SYNTHESIS)
// =================================================================
async function synthesizeLiteratureReview() {
    const docs = getSelectedDocuments();
    if (docs.length === 0) {
        showToast("Vui lòng chọn ít nhất 1 tài liệu để tổng hợp.", "warning");
        return;
    }
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    if (!backendUrl || !geminiKey) {
        showToast("Vui lòng nhập đủ Backend URL và Gemini Key trong Cài đặt.", "warning");
        return;
    }

    const documents = docs.map(doc => ({
        "Title/Author": (doc.filename || doc.title || "Unknown") + " - " + (doc.authors || doc.author || ""),
        "Theory": doc.theory || "",
        "Methodology": doc.methodology || "",
        "Key Findings": (doc.detailedFindings || []).map(f => f.content).join("; "),
    }));

    showToast(`Đang tổng hợp ${documents.length} tài liệu...`, "warning");

    try {
        const response = await fetch(`${backendUrl}/api/synthesis`, {
            method: 'POST',
            headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ api_key: geminiKey, documents: documents, workspace_id: getWorkspaceId() })
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.detail || "Không thể tổng hợp.");
        }
        openReportModal("Literature Review Synthesis", data.report, "literature_review.md");
        showToast("Tổng hợp thành công!", "success");
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    }
}

// =================================================================
// 📰 PHÂN TÍCH KHUNG TIN TỨC + SO SÁNH ĐA NGUỒN
// =================================================================
let newsCompareMode = false;

function toggleNewsCompare() {
    newsCompareMode = !newsCompareMode;
    document.getElementById('news-compare-blocks').classList.toggle('hidden', !newsCompareMode);
    document.getElementById('news-compare-toggle').textContent = newsCompareMode
        ? '- Ẩn bài báo so sánh'
        : '+ So sánh với bài báo khác';
}

function collectNewsArticles() {
    const articles = [];
    for (let i = 1; i <= 3; i++) {
        const text = document.getElementById('news-text-' + i).value.trim();
        if (!text) continue;
        articles.push({
            source: document.getElementById('news-source-' + i).value.trim(),
            date: document.getElementById('news-date-' + i).value.trim(),
            text: text
        });
    }
    return articles;
}

async function submitNewsAnalysis() {
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    const statusDiv = document.getElementById('news-status');
    const resultDiv = document.getElementById('news-result');

    if (!backendUrl || !geminiKey) {
        showToast("Vui lòng nhập đủ Backend URL và Gemini Key trong Cài đặt.", "warning");
        return;
    }
    const articles = collectNewsArticles();
    if (articles.length === 0) {
        showToast("Vui lòng dán ít nhất 1 bài báo.", "warning");
        return;
    }

    resultDiv.classList.add('hidden');
    statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích...`;

    try {
        if (articles.length === 1) {
            const response = await fetch(`${backendUrl}/api/analyze-news`, {
                method: 'POST',
                headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    api_key: geminiKey, text: articles[0].text,
                    source_name: articles[0].source, published_date: articles[0].date,
                    spreadsheet_id: getSpreadsheetId(),
                    workspace_id: getWorkspaceId()
                })
            });
            const data = await response.json();
            if (!response.ok || data.status !== 'success') throw new Error(data.detail || "Lỗi không xác định.");

            const r = data.data;
            const citedSources = Array.isArray(r.cited_sources) ? r.cited_sources.join(", ") : (r.cited_sources || "");
            resultDiv.innerHTML = `
                <h4 class="font-serif text-lg font-semibold text-slate-900 mb-4">Kết quả phân tích: ${articles[0].source || "Không rõ nguồn"}</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><span class="text-slate-400 font-medium block mb-1">Khung chủ đạo</span>${r.dominant_frame || "N/A"}</div>
                    <div><span class="text-slate-400 font-medium block mb-1">Giọng điệu</span>${r.tone || "N/A"}</div>
                    <div><span class="text-slate-400 font-medium block mb-1">Nguồn trích dẫn</span>${citedSources || "N/A"}</div>
                    <div><span class="text-slate-400 font-medium block mb-1">Dấu hiệu thiên kiến</span>${r.bias_indicators || "N/A"}</div>
                    <div class="col-span-2"><span class="text-slate-400 font-medium block mb-1">Tóm tắt</span>${r.summary || "N/A"}</div>
                    <div class="col-span-2"><span class="text-slate-400 font-medium block mb-1">Ghi chú lý thuyết</span>${r.theory_notes || "N/A"}</div>
                </div>`;
            resultDiv.classList.remove('hidden');
            statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #059669;"></i> Phân tích thành công!`;
        } else {
            const response = await fetch(`${backendUrl}/api/compare-news`, {
                method: 'POST',
                headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    api_key: geminiKey,
                    articles: articles.map(a => ({ source: a.source || "Không rõ", text: a.text })),
                    spreadsheet_id: getSpreadsheetId(),
                    workspace_id: getWorkspaceId()
                })
            });
            const data = await response.json();
            if (!response.ok || data.status !== 'success') throw new Error(data.detail || "Lỗi không xác định.");

            statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #059669;"></i> So sánh thành công!`;
            openReportModal("So sánh Khung Tin tức", data.report, "news_comparison.md");
        }
        showToast("Hoàn thành!", "success");
        loadNewsHistory();
    } catch (e) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #dc2626;"></i> Lỗi: ${e.message}`;
        showToast("Lỗi: " + e.message, "error");
    }
}

async function loadNewsHistory() {
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const historyDiv = document.getElementById('news-history');
    if (!backendUrl) return;

    try {
        const response = await fetch(`${backendUrl}/api/news-analyses?limit=20`, { headers: getBackendHeaders() });
        const data = await response.json();
        const items = (data.status === 'success') ? data.items : [];

        if (items.length === 0) {
            historyDiv.innerHTML = '<p class="text-slate-400">Chưa có dữ liệu.</p>';
            return;
        }
        historyDiv.innerHTML = items.map(item => `
            <div class="border border-slate-100 rounded-lg p-4">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-medium text-slate-900">${item.source_name || "Không rõ nguồn"}</span>
                    <span class="text-xs text-slate-400">${item.published_date || ""}</span>
                </div>
                <p class="text-slate-500">${item.dominant_frame || ""}</p>
            </div>`).join('');
    } catch (e) {
        historyDiv.innerHTML = '<p class="text-slate-400">Không tải được lịch sử.</p>';
    }
}

// =================================================================
// 🎙️ MÃ HOÁ PHỎNG VẤN (THEMATIC CODING)
// =================================================================
async function submitInterviewCoding() {
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const geminiKey = document.getElementById('global-gemini-key').value.trim();
    const role = document.getElementById('interview-role').value.trim();
    const transcript = document.getElementById('interview-transcript').value.trim();
    const statusDiv = document.getElementById('interview-status');
    const resultDiv = document.getElementById('interview-result');

    if (!backendUrl || !geminiKey) {
        showToast("Vui lòng nhập đủ Backend URL và Gemini Key trong Cài đặt.", "warning");
        return;
    }
    if (!transcript) {
        showToast("Vui lòng dán transcript phỏng vấn.", "warning");
        return;
    }

    resultDiv.classList.add('hidden');
    statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang mã hoá...`;

    try {
        const response = await fetch(`${backendUrl}/api/code-interview`, {
            method: 'POST',
            headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ api_key: geminiKey, transcript: transcript, interviewee_role: role, spreadsheet_id: getSpreadsheetId(), workspace_id: getWorkspaceId() })
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') throw new Error(data.detail || "Lỗi không xác định.");

        const themes = data.data.themes || [];
        resultDiv.innerHTML = `<h4 class="font-serif text-lg font-semibold text-slate-900 mb-4">${themes.length} chủ đề đã mã hoá</h4>` +
            themes.map(t => `
                <div class="border border-slate-100 rounded-lg p-4 mb-3">
                    <p class="font-semibold text-accent-700 mb-1">${t.theme || ""}</p>
                    <p class="text-sm text-slate-600 mb-2">${t.description || ""}</p>
                    ${(t.supporting_quotes || []).map(q => `<p class="text-sm text-slate-500 italic border-l-2 border-slate-200 pl-3 mb-1">"${q}"</p>`).join('')}
                    <p class="text-xs text-slate-400 mt-2">${t.prevalence_note || ""}</p>
                </div>`).join('');
        resultDiv.classList.remove('hidden');

        statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #059669;"></i> Mã hoá thành công!`;
        showToast(`Đã mã hoá ${themes.length} chủ đề!`, "success");
        loadInterviewHistory();
    } catch (e) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #dc2626;"></i> Lỗi: ${e.message}`;
        showToast("Lỗi: " + e.message, "error");
    }
}

async function loadInterviewHistory() {
    const backendUrl = document.getElementById('global-backend-url').value.trim().replace(/\/$/, "");
    const historyDiv = document.getElementById('interview-history');
    if (!backendUrl) return;

    try {
        const response = await fetch(`${backendUrl}/api/interview-codings?limit=20`, { headers: getBackendHeaders() });
        const data = await response.json();
        const items = (data.status === 'success') ? data.items : [];

        if (items.length === 0) {
            historyDiv.innerHTML = '<p class="text-slate-400">Chưa có dữ liệu.</p>';
            return;
        }
        historyDiv.innerHTML = items.map(item => `
            <div class="border border-slate-100 rounded-lg p-4">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-medium text-slate-900">${item.interviewee_role || "Không rõ vai trò"}</span>
                    <span class="text-xs text-slate-400">${(item.themes || []).length} chủ đề</span>
                </div>
                <p class="text-slate-500">${item.overall_summary || ""}</p>
            </div>`).join('');
    } catch (e) {
        historyDiv.innerHTML = '<p class="text-slate-400">Không tải được lịch sử.</p>';
    }
}

// =================================================================
// 📊 ĐỘ TIN CẬY GIỮA 2 NGƯỜI MÃ HOÁ (COHEN'S KAPPA)
// =================================================================
// Công thức chuẩn: κ = (P_observed - P_expected) / (1 - P_expected)
// Y hệt hàm computeCohenKappa() trong Mã.js (đã verify bằng ví dụ tính tay, kỳ vọng
// kappa=0.6) - port nguyên logic để đảm bảo 2 nơi cho cùng 1 kết quả.
function computeCohenKappa(codesA, codesB) {
    const n = codesA.length;
    let agreeCount = 0;
    const disagreements = [];
    const countsA = {};
    const countsB = {};
    const allLabels = new Set();

    for (let i = 0; i < n; i++) {
        const a = codesA[i];
        const b = codesB[i];
        allLabels.add(a);
        allLabels.add(b);
        countsA[a] = (countsA[a] || 0) + 1;
        countsB[b] = (countsB[b] || 0) + 1;
        if (a === b) {
            agreeCount++;
        } else {
            disagreements.push({ index: i, a: a, b: b });
        }
    }

    const observedAgreement = agreeCount / n;

    let expectedAgreement = 0;
    allLabels.forEach(label => {
        const pA = (countsA[label] || 0) / n;
        const pB = (countsB[label] || 0) / n;
        expectedAgreement += pA * pB;
    });

    const kappa = expectedAgreement >= 1
        ? 1
        : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);

    return { observedAgreement, expectedAgreement, kappa, disagreements };
}

function computeKappaWeb() {
    const linesA = document.getElementById('kappa-coder-a').value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    const linesB = document.getElementById('kappa-coder-b').value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    const resultDiv = document.getElementById('kappa-result');

    if (linesA.length === 0 || linesB.length === 0) {
        showToast("Vui lòng nhập mã cho cả 2 người mã hoá.", "warning");
        return;
    }
    if (linesA.length !== linesB.length) {
        showToast(`Số dòng không khớp: Coder A có ${linesA.length} dòng, Coder B có ${linesB.length} dòng.`, "error");
        return;
    }

    const result = computeCohenKappa(linesA, linesB);

    let interpretation;
    if (result.kappa < 0) interpretation = "Kém (Poor)";
    else if (result.kappa <= 0.20) interpretation = "Nhẹ (Slight)";
    else if (result.kappa <= 0.40) interpretation = "Vừa phải (Fair)";
    else if (result.kappa <= 0.60) interpretation = "Trung bình (Moderate)";
    else if (result.kappa <= 0.80) interpretation = "Đáng kể (Substantial)";
    else interpretation = "Gần như hoàn hảo (Almost Perfect)";

    const disagreementsHtml = result.disagreements.length > 0
        ? result.disagreements.slice(0, 15).map(d => `<div class="text-sm text-slate-500 py-1 border-b border-slate-50">Dòng ${d.index + 1}: <span class="text-red-500">"${d.a}"</span> ≠ <span class="text-red-500">"${d.b}"</span></div>`).join('')
        : '<p class="text-emerald-600 text-sm">✅ Không có dòng nào bất đồng.</p>';

    resultDiv.innerHTML = `
        <h4 class="font-serif text-lg font-semibold text-slate-900 mb-4">Kết quả (${linesA.length} item)</h4>
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-slate-50 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-slate-900">${(result.observedAgreement * 100).toFixed(1)}%</p>
                <p class="text-xs text-slate-500 mt-1">Tỷ lệ đồng thuận</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-accent-600">${result.kappa.toFixed(3)}</p>
                <p class="text-xs text-slate-500 mt-1">Cohen's Kappa</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-4 text-center">
                <p class="text-sm font-bold text-slate-900 mt-1.5">${interpretation}</p>
                <p class="text-xs text-slate-500 mt-1">Thang Landis &amp; Koch</p>
            </div>
        </div>
        <h5 class="font-semibold text-slate-700 mb-2 text-sm">${result.disagreements.length} dòng bất đồng${result.disagreements.length > 15 ? ' (hiển thị 15 dòng đầu)' : ''}</h5>
        ${disagreementsHtml}
    `;
    resultDiv.classList.remove('hidden');
}
