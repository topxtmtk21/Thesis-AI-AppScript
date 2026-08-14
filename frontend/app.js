// Tab Switching
function switchTab(tabId) {
    // Update active nav link
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Update title
    const titles = {
        'documents': 'Tài liệu đã lưu',
        'graph': 'Đồ thị Tri thức',
        'upload': 'Tải lên PDF',
        'notebooklm': 'Nhập từ NotebookLM'
    };
    document.getElementById('page-title').innerText = titles[tabId] || 'Dashboard';

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
            headers: getBackendHeaders()
        });
        const data = await response.json();

        if (data.status === 'success' && data.documents.length > 0) {
            tbody.innerHTML = '';
            data.documents.forEach(doc => {
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
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400">Chưa có tài liệu nào trong cơ sở dữ liệu.</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching docs:', error);
        document.getElementById('docs-body').innerHTML = '<tr><td colspan="6" class="px-6 py-12 text-center text-red-400"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Lỗi kết nối Backend.</td></tr>';
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
            headers: getBackendHeaders({ 'Content-Type': 'application/json' }),
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
    const savedSecret = localStorage.getItem('backend_secret');

    if (savedBackend) document.getElementById('global-backend-url').value = savedBackend;
    if (savedGemini) document.getElementById('global-gemini-key').value = savedGemini;
    if (savedPinecone) document.getElementById('global-pinecone-key').value = savedPinecone;
    if (savedSecret) document.getElementById('global-backend-secret').value = savedSecret;
});

function saveConfigToLocal(backendUrl, geminiKey, pineconeKey, backendSecret) {
    if (backendUrl) localStorage.setItem('backend_url', backendUrl);
    if (geminiKey) localStorage.setItem('gemini_key', geminiKey);
    if (pineconeKey) localStorage.setItem('pinecone_key', pineconeKey);
    if (backendSecret) localStorage.setItem('backend_secret', backendSecret);
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

function saveSettings() {
    const backend = document.getElementById('global-backend-url').value.trim();
    const gemini = document.getElementById('global-gemini-key').value.trim();
    const pinecone = document.getElementById('global-pinecone-key').value.trim();
    const backendSecret = document.getElementById('global-backend-secret').value.trim();

    saveConfigToLocal(backend, gemini, pinecone, backendSecret);

    // Đồng bộ cấu hình sang Google Sheets
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(() => {
            console.log("Synced to Sheets");
        }).saveConfigToProperties(backend, gemini, pinecone, backendSecret);
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
        
        if (typeof google === 'undefined' || !google.script || !google.script.run) {
            statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i> Cảnh báo: google.script.run không khả dụng (bạn đang chạy file HTML trực tiếp thay vì trên Apps Script). Không thể lưu.`;
            return;
        }

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

    } catch (error) {
        statusDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Lỗi: ${error.message}`;
        showToast("Lỗi xử lý. Vui lòng xem thông báo bên dưới nút bấm.", "error");
    }
}

