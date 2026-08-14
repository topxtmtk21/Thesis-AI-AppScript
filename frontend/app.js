// Tab Switching
function switchTab(tabId) {
    // Update active nav link
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Update title
    const titles = {
        'documents': 'Tài liệu đã lưu',
        'graph': 'Đồ thị Tri thức'
    };
    document.getElementById('page-title').innerText = titles[tabId];

    // Show selected view
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('view-' + tabId).classList.add('active');

    // Special logic for graph
    if (tabId === 'graph') {
        const frame = document.getElementById('graph-frame');
        // Reload frame to ensure physics engine starts properly
        frame.src = frame.src; 
    }
}

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
            pinecone_api_key: pineconeKey
        });
        
        const response = await fetch(`${backendUrl}/api/documents?` + params.toString(), {
            headers: {
                'ngrok-skip-browser-warning': '69420'
            }
        });
        const data = await response.json();

        if (data.status === 'success' && data.documents.length > 0) {
            window.loadedDocs = data.documents;
            data.documents.forEach((doc, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="checkbox" class="doc-checkbox" value='${JSON.stringify(doc).replace(/'/g, "&apos;")}'></td>
                    <td><i class="fa-solid fa-file-pdf" style="color:#e74c3c;"></i> ${doc.title || doc.filename || 'Unknown'}</td>
                    <td>${doc.authors || doc.author || 'Unknown'}</td>
                    <td>${doc.theory || 'Unknown'}</td>
                    <td>${doc.methodology || 'Unknown'}</td>
                    <td><button class="send-btn" style="padding: 5px 10px;" onclick="viewDoc(${index})">Xem chi tiết</button></td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Chưa có tài liệu nào trong cơ sở dữ liệu.</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching docs:', error);
        document.getElementById('docs-body').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #f87171;">Lỗi kết nối Backend.</td></tr>';
    }
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
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '69420'
            },
            body: JSON.stringify({ 
                question: text, 
                api_key: geminiKey,
                pinecone_api_key: pineconeKey
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
    const savedBackend = localStorage.getItem('backend_url');
    const savedGemini = localStorage.getItem('gemini_key');
    const savedPinecone = localStorage.getItem('pinecone_key');
    
    if (savedBackend) document.getElementById('global-backend-url').value = savedBackend;
    if (savedGemini) document.getElementById('global-gemini-key').value = savedGemini;
    if (savedPinecone) document.getElementById('global-pinecone-key').value = savedPinecone;
});

function saveConfigToLocal(backendUrl, geminiKey, pineconeKey) {
    if (backendUrl) localStorage.setItem('backend_url', backendUrl);
    if (geminiKey) localStorage.setItem('gemini_key', geminiKey);
    if (pineconeKey) localStorage.setItem('pinecone_key', pineconeKey);
}

// Modal & Toast Logic
function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
}

function viewDoc(index) {
    const doc = window.loadedDocs[index];
    if (!doc) return;
    
    document.getElementById('doc-modal-title').innerText = doc.title || doc.filename || 'Chi tiết Tài liệu';
    
    let findingsHtml = '<p style="color:var(--text-muted);">Không có phát hiện chi tiết nào.</p>';
    if (doc.detailedFindings && doc.detailedFindings.length > 0) {
        findingsHtml = '<ul style="padding-left: 20px; line-height: 1.6;">';
        doc.detailedFindings.forEach(f => {
            findingsHtml += `<li style="margin-bottom: 10px;">
                <strong>[${f.location || 'Không rõ vị trí'}]</strong> ${f.content || ''}
            </li>`;
        });
        findingsHtml += '</ul>';
    } else if (doc.keyFindings) {
        findingsHtml = `<p>${doc.keyFindings}</p>`;
    }
    
    const content = `
        <div style="margin-bottom: 15px;">
            <strong>Tác giả & Năm:</strong> ${doc.authors || doc.author || 'Unknown'} (${doc.year || 'Unknown'})
        </div>
        <div style="margin-bottom: 15px;">
            <strong>Lý thuyết:</strong> ${doc.theory || 'Unknown'}
        </div>
        <div style="margin-bottom: 15px;">
            <strong>Phương pháp:</strong> ${doc.methodology || 'Unknown'}
        </div>
        <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">
        <div style="margin-bottom: 15px;">
            <h4 style="color: var(--accent); margin-bottom: 10px;"><i class="fa-solid fa-list-check"></i> Các Nội Dung Cốt Lõi:</h4>
            ${findingsHtml}
        </div>
    `;
    
    document.getElementById('doc-modal-content').innerHTML = content;
    document.getElementById('doc-modal').classList.add('active');
}

function closeDocModal() {
    document.getElementById('doc-modal').classList.remove('active');
}

function saveSettings() {
    const backend = document.getElementById('global-backend-url').value.trim();
    const gemini = document.getElementById('global-gemini-key').value.trim();
    const pinecone = document.getElementById('global-pinecone-key').value.trim();
    
    saveConfigToLocal(backend, gemini, pinecone);
    
    // Đồng bộ cấu hình sang Google Sheets
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(() => {
            console.log("Synced to Sheets");
        }).saveConfigToProperties(backend, gemini, pinecone);
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
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '69420'
            },
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
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '69420'
            },
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
    statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên và xử lý ${file.name}... Quá trình này có thể mất vài phút.`;
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", geminiKey);
    formData.append("pinecone_api_key", pineconeKey);

    try {
        const response = await fetch(`${backendUrl}/api/upload-pdf`, {
            method: 'POST',
            headers: {
                'ngrok-skip-browser-warning': '69420'
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            statusDiv.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> Xử lý thành công! File PDF đang được tô màu và lưu ngầm trên Server.`;
            
            // Reload list of docs
            loadDocuments();
        } else {
            const data = await response.json();
            statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi: ${data.detail || "Không thể xử lý"}`;
        }
    } catch (e) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi kết nối: ${e.message}`;
    }
}

