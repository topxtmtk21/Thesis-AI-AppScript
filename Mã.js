// =================================================================
// 🌐 0. TRIỂN KHAI WEB APP (doGet) - Updated
// =================================================================
// =================================================================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Academic AI Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.ngrokUrl) {
      PropertiesService.getUserProperties().setProperty('BACKEND_URL', data.ngrokUrl);
      return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Updated BACKEND_URL"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: "Missing ngrokUrl"}))
        .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
        .setMimeType(ContentService.MimeType.JSON);
  }
}

// =================================================================
// 🖥️ 1. TẠO MENU GIAO DIỆN TRÊN GOOGLE SHEETS
// =================================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 Công cụ Luận án')
    // --- Cấu hình ---
    .addItem('🚀 Khởi tạo Bảng dữ liệu', 'setupSheet')
    .addItem('⚙️ Cấu hình API Key & Folder ID', 'configureSettings')
    .addItem('🔗 Cập nhật Backend URL', 'configureBackendUrl')
    .addItem('📋 Xem Cấu hình Hiện tại', 'showCurrentSettings')
    .addItem('🔍 Kiểm tra lỗi API (Chẩn đoán)', 'runDiagnostics')
    .addSeparator()
    // --- Phân tích Tài liệu Học thuật ---
    .addItem('⚡ Chạy Phân tích Tài liệu (Quét thư mục)', 'processNewDocuments')
    .addItem('⚡ Phân tích Nâng cao (Có trang & Tham khảo)', 'processDocumentsAdvanced')
    .addItem('📝 Dán văn bản từ NotebookLM', 'openNotebookLMDialog')
    .addItem('🔄 Kiểm tra tiến trình đang xử lý nền', 'checkPendingJobsManually')
    .addSeparator()
    // --- Trợ lý AI & Tổng hợp ---
    .addItem('💬 Chat với Trợ lý AI (RAG)', 'openChatSidebar')
    .addItem('🧠 Tổng hợp Literature Review (Matrix Synthesis)', 'generateMatrixSynthesis')
    .addSeparator()
    // --- Xuất & Trực quan hoá ---
    .addItem('📥 Xuất file RIS (Zotero/EndNote)', 'exportRis')
    .addItem('🕸️ Xem Đồ thị Kiến thức (Knowledge Graph)', 'showKnowledgeGraph')
    .addItem('📅 Xem Timeline Nghiên cứu', 'showResearchTimeline')
    .addSeparator()
    // --- Công cụ chuyên ngành Báo chí học ---
    .addItem('📰 Phân tích Khung Tin tức', 'openNewsAnalysisDialog')
    .addItem('🎙️ Mã hoá Phỏng vấn (Thematic Coding)', 'openInterviewCodingDialog')
    .addItem('📊 Tính Độ tin cậy Mã hoá (Cohen\'s Kappa)', 'calculateInterCoderReliability')
    .addToUi();
}

// =================================================================
// ⚙️ 2. GIAO DIỆN NHẬP & LƯU BẢO MẬT API KEY / FOLDER ID
// =================================================================
function configureSettings() {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();
  
  // 1. Nhập Gemini API Key
  const currentApiKey = userProperties.getProperty('GEMINI_API_KEY') || '';
  const apiKeyResponse = ui.prompt(
    'Cấu hình Gemini API Key',
    `Nhập Gemini API Key của bạn (Hiện tại: ${currentApiKey ? '***' + currentApiKey.slice(-4) : 'Chưa thiết lập'}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (apiKeyResponse.getSelectedButton() === ui.Button.OK) {
    const newApiKey = apiKeyResponse.getResponseText().trim();
    if (newApiKey) {
      userProperties.setProperty('GEMINI_API_KEY', newApiKey);
    }
  } else {
    return; // Người dùng nhấn Cancel
  }

  // 2. Nhập Google Drive Folder ID
  const currentFolderId = userProperties.getProperty('FOLDER_ID') || '';
  const folderResponse = ui.prompt(
    'Cấu hình Thư mục Google Drive',
    `Nhập Folder ID chứa tài liệu (Hiện tại: ${currentFolderId || 'Chưa thiết lập'}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (folderResponse.getSelectedButton() === ui.Button.OK) {
    const newFolderId = folderResponse.getResponseText().trim();
    if (newFolderId) {
      userProperties.setProperty('FOLDER_ID', newFolderId);
    }
  } else {
    return;
  }

  // 3. Nhập Pinecone API Key
  const currentPineconeKey = userProperties.getProperty('PINECONE_API_KEY') || '';
  const pineconeResponse = ui.prompt(
    'Cấu hình Pinecone API Key',
    `Nhập Pinecone API Key của bạn (Hiện tại: ${currentPineconeKey ? '***' + currentPineconeKey.slice(-4) : 'Chưa thiết lập'}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (pineconeResponse.getSelectedButton() === ui.Button.OK) {
    const newPineconeKey = pineconeResponse.getResponseText().trim();
    if (newPineconeKey) {
      userProperties.setProperty('PINECONE_API_KEY', newPineconeKey);
    }
  }

  // 4. Nhập Backend Secret (tuỳ chọn - chỉ cần nếu Backend có bật BACKEND_SHARED_SECRET)
  const currentSecret = userProperties.getProperty('BACKEND_SECRET') || '';
  const secretResponse = ui.prompt(
    'Cấu hình Backend Secret (Tuỳ chọn)',
    `Chỉ cần điền nếu Backend của bạn có bật xác thực (biến môi trường BACKEND_SHARED_SECRET). Để trống nếu không dùng.\n(Hiện tại: ${currentSecret ? '✅ Đã lưu' : 'Chưa thiết lập'}):`,
    ui.ButtonSet.OK_CANCEL
  );
  if (secretResponse.getSelectedButton() === ui.Button.OK) {
    const newSecret = secretResponse.getResponseText().trim();
    if (newSecret) {
      userProperties.setProperty('BACKEND_SECRET', newSecret);
    }
  }

  ui.alert('✅ Đã lưu cấu hình thành công! Thông tin này sẽ được bảo mật và dùng cho các lần chạy sau.');
}

// Header dùng chung cho mọi lệnh gọi UrlFetchApp tới Backend: thêm X-Backend-Secret
// nếu người dùng đã cấu hình (Backend chỉ kiểm tra header này khi có bật
// BACKEND_SHARED_SECRET, nên không cấu hình gì thì hành vi vẫn như cũ).
function getBackendHeaders() {
  const secret = PropertiesService.getUserProperties().getProperty('BACKEND_SECRET');
  const headers = { 'ngrok-skip-browser-warning': '69420' };
  if (secret) headers['X-Backend-Secret'] = secret;
  return headers;
}

// =================================================================
// 🔗 GIAO DIỆN CẬP NHẬT NHANH BACKEND URL
// =================================================================
function configureBackendUrl() {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();

  const currentBackendUrl = userProperties.getProperty('BACKEND_URL') || '';
  const backendResponse = ui.prompt(
    'Cập nhật Backend URL',
    `Nhập URL Backend của bạn (VD: link Cloud Run/Railway dạng https://xxxx.run.app, hoặc link Ngrok nếu đang chạy local dạng https://xxxx.ngrok-free.app)\n(Hiện tại: ${currentBackendUrl || 'Chưa thiết lập'}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (backendResponse.getSelectedButton() === ui.Button.OK) {
    let newBackendUrl = backendResponse.getResponseText().trim();
    // Tự động bỏ dấu gạch chéo cuối nếu người dùng vô tình copy thừa
    if (newBackendUrl.endsWith('/')) {
        newBackendUrl = newBackendUrl.slice(0, -1);
    }
    if (newBackendUrl) {
      userProperties.setProperty('BACKEND_URL', newBackendUrl);
      ui.alert('✅ Đã cập nhật Backend URL thành công!');
    }
  }
}

// 📋 Xem cấu hình hiện tại
function showCurrentSettings() {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const folderId = userProperties.getProperty('FOLDER_ID');
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const pineconeKey = userProperties.getProperty('PINECONE_API_KEY');
  const backendSecret = userProperties.getProperty('BACKEND_SECRET');

  const message = `📌 THÔNG TIN CẤU HÌNH HIỆN TẠI:\n\n` +
    `• Gemini API Key: ${apiKey ? '✅ Đã lưu (***' + apiKey.slice(-4) + ')' : '❌ Chưa thiết lập'}\n` +
    `• Pinecone API Key: ${pineconeKey ? '✅ Đã lưu (***' + pineconeKey.slice(-4) + ')' : '❌ Chưa thiết lập'}\n` +
    `• Drive Folder ID: ${folderId ? '✅ ' + folderId : '❌ Chưa thiết lập'}\n` +
    `• Backend URL: ${backendUrl ? '✅ ' + backendUrl : '❌ Chưa thiết lập'}\n` +
    `• Backend Secret: ${backendSecret ? '✅ Đã lưu (tuỳ chọn)' : '➖ Chưa thiết lập (tuỳ chọn)'}`;

  ui.alert(message);
}

// =================================================================
// 📐 3. HÀM KHỞI TẠO TIÊU ĐỀ CỘT & ĐỊNH DẠNG BẢNG
// =================================================================
function setupSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  const headers = [
    [
      "Nguồn dữ liệu", 
      "Phương thức", 
      "File đính kèm (PDF)",
      "Tác giả", 
      "Năm xuất bản", 
      "Tựa đề bài báo",
      "Tạp chí/Hội nghị",
      "Trích dẫn APA 7th", 
      "Khung lý thuyết", 
      "Phương pháp nghiên cứu",
      "Cỡ mẫu (Sample)",
      "Kết quả chính",
      "Khoảng trống nghiên cứu (Research Gap)", 
      "Hạn chế (Limitations)",
      "Phát hiện chuyên sâu",
      "Trích dẫn gốc (Tiếng Anh)",
      "Bản dịch Tiếng Việt"
    ]
  ];
  
  const range = sheet.getRange(1, 1, 1, 17);
  range.setValues(headers);
  
  range.setFontWeight("bold")
       .setBackground("#d9ead3")
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle")
       .setWrap(true);
       
  sheet.setColumnWidth(1, 120); // Nguồn
  sheet.setColumnWidth(2, 100); // Phương thức
  sheet.setColumnWidth(3, 150); // File đính kèm
  sheet.setColumnWidth(4, 150); // Tác giả
  sheet.setColumnWidth(5, 80);  // Năm
  sheet.setColumnWidth(6, 250); // Tựa đề
  sheet.setColumnWidth(7, 180); // Tạp chí
  sheet.setColumnWidth(8, 250); // APA 7
  sheet.setColumnWidth(9, 200); // Lý thuyết
  sheet.setColumnWidth(10, 200); // Phương pháp
  sheet.setColumnWidth(11, 120); // Mẫu
  sheet.setColumnWidth(12, 250); // Kết quả
  sheet.setColumnWidth(13, 200); // Gap
  sheet.setColumnWidth(14, 200); // Hạn chế
  sheet.setColumnWidth(15, 300); // Phát hiện sâu
  sheet.setColumnWidth(16, 250); // Gốc
  sheet.setColumnWidth(17, 250); // Dịch
  
  // Đóng băng dòng 1
  sheet.setFrozenRows(1);
  
  SpreadsheetApp.getUi().alert("✅ Đã khởi tạo xong Bảng dữ liệu Luận án (17 cột)!");
}

// =================================================================
// 🔄 4. TRÍCH XUẤT TEXT BẰNG GOOGLE DRIVE OCR
// =================================================================
function extractTextFromFile(fileId) {
  const token = ScriptApp.getOAuthToken();
  const copyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/copy`;
  
  // Yêu cầu Drive tạo một bản sao dưới dạng Google Docs để kích hoạt OCR
  const payload = {
    "mimeType": "application/vnd.google-apps.document"
  };
  
  const copyOptions = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  let newDocId = null;
  try {
    const response = UrlFetchApp.fetch(copyUrl, copyOptions);
    if (response.getResponseCode() !== 200) {
      throw new Error("Lỗi khi dùng Drive OCR: " + response.getContentText());
    }
    
    const fileInfo = JSON.parse(response.getContentText());
    newDocId = fileInfo.id;
    
    // Mở file Docs vừa tạo và lấy toàn bộ chữ
    const doc = DocumentApp.openById(newDocId);
    const text = doc.getBody().getText();
    
    return text;
  } catch(e) {
    throw e;
  } finally {
    // Dọn dẹp: Xóa file Google Docs tạm thời dù thành công hay lỗi
    if (newDocId) {
      const deleteUrl = `https://www.googleapis.com/drive/v3/files/${newDocId}`;
      UrlFetchApp.fetch(deleteUrl, {
        method: "delete",
        headers: { "Authorization": "Bearer " + token },
        muteHttpExceptions: true
      });
    }
  }
}

// =================================================================
// ⏱️ 5.0 HÀNG ĐỢI JOB BẤT ĐỒNG BỘ (tránh giới hạn 6 phút/lần chạy của Apps Script)
// =================================================================
// Backend xử lý PDF/Gemini/Pinecone có thể mất vài phút cho mỗi file. Thay vì gọi
// và CHỜ trong cùng 1 lần thực thi (bị Apps Script ngắt sau 6 phút => giới hạn
// MAX_FILES=5 trước đây), giờ ta chỉ "gửi job" (rất nhanh) rồi để 1 trigger chạy
// mỗi phút để hỏi kết quả và tự ghi vào Sheet khi xong.
const PENDING_JOBS_KEY = 'PENDING_ANALYSIS_JOBS';
const POLL_TRIGGER_HANDLER = 'checkPendingJobs';
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 phút chưa xong thì coi như lỗi, tránh trigger chạy mãi

function getPendingJobs() {
  const raw = PropertiesService.getDocumentProperties().getProperty(PENDING_JOBS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function savePendingJobs(jobs) {
  PropertiesService.getDocumentProperties().setProperty(PENDING_JOBS_KEY, JSON.stringify(jobs));
}

function ensurePollingTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === POLL_TRIGGER_HANDLER);
  if (!exists) {
    ScriptApp.newTrigger(POLL_TRIGGER_HANDLER).timeBased().everyMinutes(1).create();
  }
}

function removePollingTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === POLL_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// Cho phép người dùng chủ động bấm kiểm tra ngay thay vì đợi trigger tự động (chạy mỗi phút)
function checkPendingJobsManually() {
  const ui = SpreadsheetApp.getUi();
  const before = getPendingJobs().length;
  if (before === 0) {
    ui.alert("✅ Hiện không có job nào đang chờ xử lý.");
    return;
  }
  checkPendingJobs();
  const after = getPendingJobs().length;
  ui.alert(`🔄 Đã kiểm tra ${before} job đang chờ.\n✅ Hoàn thành: ${before - after}\n⏳ Còn đang xử lý: ${after}`);
}

function safeGetFile(fileId) {
  try {
    return DriveApp.getFileById(fileId);
  } catch (e) {
    return null;
  }
}

// Ghi 1 dòng kết quả thành công, đúng thứ tự 17 cột của setupSheet()
function appendJobResultRow(sheet, fileName, sourceLabel, methodLabel, result) {
  let findingsText = result.keyFindings || "N/A";
  if (Array.isArray(findingsText)) findingsText = findingsText.join("\n");

  let detailedFindingsStr = "N/A";
  if (result.detailedFindings && Array.isArray(result.detailedFindings) && result.detailedFindings.length > 0) {
    detailedFindingsStr = result.detailedFindings.map(f => `- [${f.location || "Không rõ"}] ${f.content || ""}`).join("\n");
  }

  sheet.appendRow([
    sourceLabel,
    methodLabel,
    fileName,
    result.authors || "N/A",
    result.year || "N/A",
    result.title || "N/A",
    result.journal || "N/A",
    result.apa7 || "N/A",
    result.theory || "N/A",
    result.methodology || "N/A",
    result.sampleSize || "N/A",
    findingsText,
    result.researchGap || "N/A",
    result.limitations || "N/A",
    detailedFindingsStr,
    result.originalQuote || "N/A",
    result.translatedQuote || "N/A"
  ]);
}

function appendErrorRow(sheet, fileName, sourceLabel, errorMessage) {
  sheet.appendRow([sourceLabel, "⚠️ LỖI", fileName, String(errorMessage).substring(0, 500)]);
}

// Được gọi mỗi phút bởi trigger để hỏi Backend job nào đã xong, ghi kết quả vào Sheet,
// và tự xoá trigger khi không còn job nào đang chờ.
function checkPendingJobs() {
  const backendUrl = PropertiesService.getUserProperties().getProperty('BACKEND_URL');
  const jobs = getPendingJobs();

  if (!jobs.length || !backendUrl) {
    savePendingJobs([]);
    removePollingTrigger();
    return;
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const stillPending = [];

  jobs.forEach(job => {
    const sheet = spreadsheet.getSheetByName(job.sheetName) || spreadsheet.getActiveSheet();
    const sourceLabel = job.mode === 'advanced' ? "Quét thư mục (PDF gốc)" : "Quét thư mục (OCR)";
    const methodLabel = job.mode === 'advanced' ? "Tự động (Vision AI)" : "Tự động (OCR)";

    if (Date.now() - job.submittedAt > JOB_TIMEOUT_MS) {
      appendErrorRow(sheet, job.fileName, sourceLabel, "Timeout: không nhận được phản hồi từ Backend sau 30 phút.");
      const file = safeGetFile(job.fileId);
      if (file) file.setDescription("PROCESSED - Timeout - " + new Date().toISOString());
      return;
    }

    let response;
    try {
      response = UrlFetchApp.fetch(`${backendUrl}/api/jobs/${job.jobId}`, {
        method: "get",
        headers: getBackendHeaders(),
        muteHttpExceptions: true
      });
    } catch (e) {
      stillPending.push(job); // Lỗi mạng tạm thời, thử lại ở lượt poll sau
      return;
    }

    if (response.getResponseCode() === 404) {
      appendErrorRow(sheet, job.fileName, sourceLabel, "Job đã mất (có thể do Backend khởi động lại). Vui lòng chạy phân tích lại cho file này.");
      const file = safeGetFile(job.fileId);
      if (file) file.setDescription(""); // Reset để có thể gửi lại
      return;
    }

    if (response.getResponseCode() !== 200) {
      stillPending.push(job);
      return;
    }

    const body = JSON.parse(response.getContentText());
    if (body.status === 'pending') {
      stillPending.push(job);
      return;
    }

    const file = safeGetFile(job.fileId);
    if (body.status === 'success' && body.data) {
      appendJobResultRow(sheet, job.fileName, sourceLabel, methodLabel, body.data);
      if (file) file.setDescription("PROCESSED - " + new Date().toISOString());
    } else {
      appendErrorRow(sheet, job.fileName, sourceLabel, body.error || "Lỗi không xác định từ Backend.");
      if (file) file.setDescription("PROCESSED - Có lỗi - " + new Date().toISOString());
    }
  });

  savePendingJobs(stillPending);
  if (stillPending.length === 0) {
    removePollingTrigger();
  }
}

// =================================================================
// 🤖 5. QUÉT THƯ MỤC VÀ XỬ LÝ (PDF, DOCX, ẢNH)
// =================================================================
function processNewDocuments() {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();

  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const folderId = userProperties.getProperty('FOLDER_ID');
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const pineconeKey = userProperties.getProperty('PINECONE_API_KEY');

  if (!apiKey || !folderId || !pineconeKey) {
    ui.alert("⚠️ Bạn chưa cấu hình đủ API Key (Gemini, Pinecone) hoặc Folder ID!");
    return;
  }
  if (!backendUrl) {
    ui.alert("⚠️ Bạn chưa cấu hình Backend URL! Không thể phân tích tài liệu.");
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const allowedMimeTypes = [
    MimeType.PDF,
    MimeType.MICROSOFT_WORD,
    MimeType.JPEG,
    MimeType.PNG,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  try {
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      ui.alert(`❌ LỖI TÌM THƯ MỤC:\nKhông thể tìm thấy thư mục có ID: "${folderId}".\nVui lòng kiểm tra lại ID trong phần Cấu hình hoặc đảm bảo bạn có quyền truy cập.`);
      return;
    }
    const files = folder.getFiles();
    let submittedCount = 0;
    // Không còn phải chờ Gemini/Pinecone xử lý xong trong lần chạy này (chạy nền ở Backend),
    // nên có thể gửi nhiều file hơn hẳn, chỉ còn bị giới hạn bởi thời gian OCR + gửi job.
    const MAX_FILES = 25;
    const newJobs = [];

    while (files.hasNext() && submittedCount < MAX_FILES) {
      const file = files.next();

      // Hỗ trợ cả PDF, Word, và ảnh chụp
      if (!allowedMimeTypes.includes(file.getMimeType())) continue;

      const desc = file.getDescription() || "";
      if (desc.includes("PROCESSED") || desc.includes("SUBMITTED")) continue;

      try {
        // Bước 1: Trích xuất Text bằng Google Drive OCR
        SpreadsheetApp.getActiveSpreadsheet().toast(`Đang bóc tách chữ từ: ${file.getName()}`, '⏳ Đang quét OCR', -1);
        const textContext = extractTextFromFile(file.getId());

        if (!textContext || textContext.trim().length === 0) {
           appendErrorRow(sheet, file.getName(), "Quét thư mục (OCR)", "File rỗng hoặc hệ thống không thể trích xuất được chữ.");
           file.setDescription("PROCESSED - Lỗi OCR - " + new Date().toISOString());
           submittedCount++;
           continue;
        }

        // Bước 2: Gửi job phân tích cho Backend (không chờ) - Backend sẽ tự chạy Gemini AI,
        // lưu Vector DB & Knowledge Graph trong nền.
        SpreadsheetApp.getActiveSpreadsheet().toast(`Đang gửi job phân tích: ${file.getName()}`, '🚀 Đã gửi', -1);

        const payload = {
          filename: file.getName(),
          text: textContext,
          api_key: apiKey,
          pinecone_api_key: pineconeKey
        };

        const response = UrlFetchApp.fetch(backendUrl + "/api/jobs/analyze-text", {
          method: "post",
          contentType: "application/json",
          headers: getBackendHeaders(),
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) {
           appendErrorRow(sheet, file.getName(), "Quét thư mục (OCR)", "Lỗi gửi job tới Backend: " + response.getContentText());
           file.setDescription("PROCESSED - Lỗi gửi job - " + new Date().toISOString());
           submittedCount++;
           continue;
        }

        const jobId = JSON.parse(response.getContentText()).job_id;
        newJobs.push({
          jobId: jobId,
          fileId: file.getId(),
          fileName: file.getName(),
          sheetName: sheet.getName(),
          mode: 'basic',
          submittedAt: Date.now()
        });
        file.setDescription("SUBMITTED - " + new Date().toISOString());
        submittedCount++;

      } catch (innerError) {
         appendErrorRow(sheet, file.getName(), "Quét thư mục (OCR)", innerError.toString());
         file.setDescription("PROCESSED - Có lỗi - " + new Date().toISOString());
         submittedCount++;
      }
    }

    if (newJobs.length > 0) {
      savePendingJobs(getPendingJobs().concat(newJobs));
      ensurePollingTrigger();
    }

    if (files.hasNext()) {
      ui.alert(`⏳ Đã gửi ${submittedCount} file để AI xử lý trong nền.\n\nHãy chạy lại Menu > "Chạy Phân tích" để gửi tiếp các file còn lại. Kết quả sẽ tự động xuất hiện trong Sheet, không cần chờ.`);
    } else if (submittedCount > 0) {
      ui.alert(`🚀 Đã gửi ${submittedCount} tài liệu cho AI xử lý trong nền.\n\nKết quả sẽ tự động được ghi vào Sheet trong vài phút tới, bạn không cần giữ trình duyệt mở hay chạy lại menu.`);
    } else {
      ui.alert(`✅ Không tìm thấy tài liệu mới nào cần phân tích trong thư mục.`);
    }

  } catch (e) {
    ui.alert("❌ Đã xảy ra lỗi hệ thống: " + e.toString());
  }
}


// =================================================================
// 🚑 7. CÔNG CỤ CHẨN ĐOÁN LỖI API CHUYÊN SÂU
// =================================================================
function runDiagnostics() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = PropertiesService.getUserProperties().getProperty('GEMINI_API_KEY');
  
  if (!apiKey) {
    ui.alert("⚠️ Chưa có API Key. Vui lòng thiết lập API Key trước.");
    return;
  }
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;
  const payload = { "contents": [{ "parts": [{ "text": "Hello" }] }] };
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      ui.alert("✅ CHẨN ĐOÁN THÀNH CÔNG:\n\nAPI Key của bạn hoàn toàn hợp lệ và kết nối mạng rất tốt.\n\n👉 Nếu bạn vẫn bị lỗi khi phân tích, hãy kiểm tra lại file của bạn (ví dụ: bị đặt mật khẩu).");
    } else {
      ui.alert("❌ PHÁT HIỆN LỖI API KEY:\n\n" + response.getContentText());
    }
  } catch (e) {
    ui.alert("❌ LỖI HỆ THỐNG:\n\n" + e.toString());
  }
}

// =================================================================
// 💬 8. MỞ GIAO DIỆN CHAT VÀ XỬ LÝ CHAT RAG
// =================================================================
function openChatSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('sidebar')
      .setTitle('Trợ lý AI (RAG)')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function processChat(question, useSpecificFile = false) {
  const userProperties = PropertiesService.getUserProperties();
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const pineconeKey = userProperties.getProperty('PINECONE_API_KEY');

  if (!backendUrl || !apiKey || !pineconeKey) {
    throw new Error("Bạn chưa cấu hình đủ Backend URL hoặc các API Key!");
  }
  
  let specificFilename = null;
  if (useSpecificFile) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const activeRow = sheet.getActiveCell().getRow();
    if (activeRow > 1) {
      specificFilename = sheet.getRange(activeRow, 1).getValue();
    }
  }

  const payload = {
    question: question,
    api_key: apiKey,
    pinecone_api_key: pineconeKey,
    filename: specificFilename
  };

  const response = UrlFetchApp.fetch(backendUrl + "/api/chat", {
    method: "post",
    contentType: "application/json",
    headers: getBackendHeaders(),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("Lỗi từ Backend: " + response.getContentText());
  }

  const jsonResponse = JSON.parse(response.getContentText());
  if (jsonResponse.status === "success" && jsonResponse.answer) {
    return { answer: jsonResponse.answer };
  } else {
    throw new Error("Dữ liệu trả về không hợp lệ.");
  }
}

// =================================================================
// ⚙️ 9. ĐỒNG BỘ CẤU HÌNH TỪ WEB APP XUỐNG SHEETS
// =================================================================
function saveConfigToProperties(backendUrl, geminiKey, pineconeKey, backendSecret) {
  const userProperties = PropertiesService.getUserProperties();
  if (backendUrl) userProperties.setProperty('BACKEND_URL', backendUrl);
  if (geminiKey) userProperties.setProperty('GEMINI_API_KEY', geminiKey);
  if (pineconeKey) userProperties.setProperty('PINECONE_API_KEY', pineconeKey);
  if (backendSecret) userProperties.setProperty('BACKEND_SECRET', backendSecret);
  return true;
}
// =================================================================
// 🚀 6. PHÂN TÍCH NÂNG CAO (GỬI TRỰC TIẾP PDF ĐỂ LẤY SỐ TRANG)
// =================================================================
function processDocumentsAdvanced() {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();

  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const folderId = userProperties.getProperty('FOLDER_ID');
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const pineconeKey = userProperties.getProperty('PINECONE_API_KEY');

  if (!apiKey || !folderId || !pineconeKey) {
    ui.alert("⚠️ Bạn chưa cấu hình đủ API Key (Gemini, Pinecone) hoặc Folder ID!");
    return;
  }
  if (!backendUrl) {
    ui.alert("⚠️ Bạn chưa cấu hình Backend URL!");
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const allowedMimeTypes = [MimeType.PDF];

  try {
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      ui.alert(`❌ LỖI TÌM THƯ MỤC:\nKhông thể tìm thấy thư mục có ID: "${folderId}".`);
      return;
    }
    const files = folder.getFiles();
    let submittedCount = 0;
    const MAX_FILES = 25; // Chỉ giới hạn thời gian upload blob, không còn chờ AI xử lý
    const newJobs = [];

    while (files.hasNext() && submittedCount < MAX_FILES) {
      const file = files.next();

      if (!allowedMimeTypes.includes(file.getMimeType())) continue;
      const desc = file.getDescription() || "";
      if (desc.includes("PROCESSED_ADVANCED") || desc.includes("SUBMITTED_ADVANCED")) continue;

      try {
        SpreadsheetApp.getActiveSpreadsheet().toast(`Đang upload PDF sang Backend: ${file.getName()}`, '🚀 Đã gửi', -1);

        const payload = {
          file: file.getBlob(),
          api_key: apiKey,
          pinecone_api_key: pineconeKey
        };

        const response = UrlFetchApp.fetch(backendUrl + "/api/jobs/analyze-pdf", {
          method: "post",
          headers: getBackendHeaders(),
          payload: payload,
          muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) {
           appendErrorRow(sheet, file.getName(), "Quét thư mục (PDF gốc)", "Lỗi gửi job tới Backend: " + response.getContentText());
           file.setDescription("PROCESSED_ADVANCED - Lỗi gửi job - " + new Date().toISOString());
           submittedCount++;
           continue;
        }

        const jobId = JSON.parse(response.getContentText()).job_id;
        newJobs.push({
          jobId: jobId,
          fileId: file.getId(),
          fileName: file.getName(),
          sheetName: sheet.getName(),
          mode: 'advanced',
          submittedAt: Date.now()
        });
        file.setDescription("SUBMITTED_ADVANCED - " + new Date().toISOString());
        submittedCount++;

      } catch (innerError) {
         appendErrorRow(sheet, file.getName(), "Quét thư mục (PDF gốc)", innerError.toString());
         file.setDescription("PROCESSED_ADVANCED - Có lỗi - " + new Date().toISOString());
         submittedCount++;
      }
    }

    if (newJobs.length > 0) {
      savePendingJobs(getPendingJobs().concat(newJobs));
      ensurePollingTrigger();
    }

    if (files.hasNext()) {
      ui.alert(`⏳ Đã gửi ${submittedCount} file để phân tích nâng cao trong nền.\nHãy chạy lại Menu để gửi tiếp các file còn lại.`);
    } else if (submittedCount > 0) {
      ui.alert(`🚀 Đã gửi ${submittedCount} tài liệu để phân tích nâng cao trong nền.\nKết quả sẽ tự động xuất hiện trong Sheet, không cần chờ.`);
    } else {
      ui.alert(`✅ Không tìm thấy tài liệu PDF mới nào cần phân tích.`);
    }

  } catch (e) {
    ui.alert("❌ Đã xảy ra lỗi hệ thống: " + e.toString());
  }
}

// =================================================================
// 🧠 8. TỔNG HỢP LITERATURE REVIEW (MATRIX SYNTHESIS)
// =================================================================
function generateMatrixSynthesis() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const userProperties = PropertiesService.getUserProperties();
  
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const backendUrl = userProperties.getProperty('BACKEND_URL');

  if (!apiKey || !backendUrl) {
    ui.alert("⚠️ Bạn chưa cấu hình đủ API Key hoặc Backend URL!");
    return;
  }

  // Lấy các dòng đang bôi đen
  const activeRange = sheet.getActiveRange();
  let startRow = activeRange.getRow();
  let numRows = activeRange.getNumRows();
  
  if (numRows === 1) {
    const response = ui.alert("Chưa bôi đen dữ liệu", "Bạn chỉ đang chọn 1 dòng. Bạn có muốn tổng hợp TẤT CẢ các bài báo có trong bảng không?", ui.ButtonSet.YES_NO);
    if (response === ui.Button.YES) {
      startRow = 2; // Bỏ qua Header
      numRows = sheet.getLastRow() - 1;
    } else {
      return;
    }
  }

  if (numRows <= 0) {
    ui.alert("⚠️ Không có dữ liệu để tổng hợp.");
    return;
  }

  const dataRange = sheet.getRange(startRow, 1, numRows, 13);
  const values = dataRange.getValues();
  
  const documents = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue; 
    
    documents.push({
      "Title/Author": row[0] + " - " + row[1],
      "Theory": row[4],
      "Methodology": row[5],
      "Key Findings": row[7],
      "Research Gap": row[8],
      "Limitations": row[9]
    });
  }

  if (documents.length === 0) {
    ui.alert("⚠️ Không tìm thấy bài báo nào hợp lệ trong vùng chọn.");
    return;
  }

  SpreadsheetApp.getActiveSpreadsheet().toast("Đang gửi " + documents.length + " bài báo cho AI tổng hợp...", "🧠 Matrix Synthesis", -1);

  try {
    const payload = {
      api_key: apiKey,
      documents: documents
    };
    
    const response = UrlFetchApp.fetch(backendUrl + "/api/synthesis", {
      method: "post",
      contentType: "application/json",
      headers: getBackendHeaders(),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      ui.alert("⚠️ Lỗi từ Backend: " + response.getContentText());
      return;
    }
    
    const jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse.status === "success" && jsonResponse.report) {
      const doc = DocumentApp.create("Matrix Synthesis Report - " + new Date().toLocaleDateString());
      const body = doc.getBody();
      body.insertParagraph(0, jsonResponse.report);
      
      const docUrl = doc.getUrl();
      
      const htmlOutput = HtmlService.createHtmlOutput('<p>✅ Tổng hợp thành công!</p><p>Mở báo cáo tại đây: <a href="' + docUrl + '" target="_blank">Matrix Synthesis Report</a></p>')
        .setWidth(350)
        .setHeight(150);
      ui.showModalDialog(htmlOutput, 'Hoàn thành Literature Review');
      
    } else {
      ui.alert("⚠️ Lỗi phân tích JSON từ Backend");
    }
  } catch (e) {
    ui.alert("❌ Đã xảy ra lỗi hệ thống: " + e.toString());
  }
}

// =================================================================
// 📥 9. XUẤT FILE RIS (CHO ZOTERO/ENDNOTE)
// =================================================================
function exportRis() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  let lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert("⚠️ Chưa có dữ liệu để xuất.");
    return;
  }
  
  const values = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  
  let risContent = "";
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    
    const fileName = row[0]; 
    const authorYear = row[1] || "";
    const journal = row[2] || "";
    
    let author = authorYear;
    let year = "";
    const yearMatch = authorYear.match(/\((\d{4})\)/);
    if (yearMatch) {
      year = yearMatch[1];
      author = authorYear.replace(yearMatch[0], "").trim();
    }
    
    risContent += "TY  - JOUR\n";
    risContent += "TI  - " + fileName.replace(".pdf", "") + "\n";
    risContent += "AU  - " + author + "\n";
    risContent += "PY  - " + year + "\n";
    risContent += "JO  - " + journal + "\n";
    risContent += "ER  - \n\n";
  }
  
  const base64Data = Utilities.base64Encode(Utilities.newBlob(risContent).getBytes());
  const htmlOutput = HtmlService.createHtmlOutput(`
    <p>File RIS đã sẵn sàng để tải xuống.</p>
    <a href="data:application/x-research-info-systems;base64,${base64Data}" download="References.ris" class="btn" style="padding: 10px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Tải xuống File RIS</a>
  `)
  .setWidth(300)
  .setHeight(150);
  
  ui.showModalDialog(htmlOutput, 'Xuất file RIS');
}

// =================================================================
// 🕸️ 10. XEM ĐỒ THỊ KIẾN THỨC (KNOWLEDGE GRAPH)
// =================================================================
function showKnowledgeGraph() {
  const userProperties = PropertiesService.getUserProperties();
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const ui = SpreadsheetApp.getUi();

  if (!backendUrl) {
    ui.alert("⚠️ Bạn chưa cấu hình Backend URL!");
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; }
          iframe { width: 100%; height: 100vh; border: none; }
        </style>
      </head>
      <body>
        <iframe src="${backendUrl}/api/graph"></iframe>
      </body>
    </html>
  `;
  
  const htmlOutput = HtmlService.createHtmlOutput(html)
      .setWidth(1000)
      .setHeight(700);
      
  ui.showModalDialog(htmlOutput, '🕸️ Mạng lưới Trích dẫn (Knowledge Graph)');
}

// =================================================================
// 📅 10b. XEM TIMELINE NGHIÊN CỨU
// =================================================================
function showResearchTimeline() {
  const userProperties = PropertiesService.getUserProperties();
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const ui = SpreadsheetApp.getUi();

  if (!backendUrl) {
    ui.alert("⚠️ Bạn chưa cấu hình Backend URL!");
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; }
          iframe { width: 100%; height: 100vh; border: none; }
        </style>
      </head>
      <body>
        <iframe src="${backendUrl}/api/timeline"></iframe>
      </body>
    </html>
  `;

  const htmlOutput = HtmlService.createHtmlOutput(html)
      .setWidth(900)
      .setHeight(700);

  ui.showModalDialog(htmlOutput, '📅 Timeline Nghiên cứu');
}

// =================================================================
// 🧰 TIỆN ÍCH: LẤY (HOẶC TẠO MỚI) 1 SHEET TAB THEO TÊN, KÈM HEADER
// =================================================================
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold")
         .setBackground("#d9ead3")
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle")
         .setWrap(true);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// =================================================================
// 📰 11. PHÂN TÍCH KHUNG TIN TỨC (FRAMING ANALYSIS) + SO SÁNH ĐA NGUỒN
// =================================================================
function openNewsAnalysisDialog() {
  const html = HtmlService.createHtmlOutputFromFile('news_analysis_dialog')
      .setWidth(650)
      .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

function processNewsAnalysis(articles) {
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const ui = SpreadsheetApp.getUi();

  if (!apiKey || !backendUrl) {
    throw new Error("Bạn chưa cấu hình đủ Gemini API Key hoặc Backend URL!");
  }
  if (!articles || articles.length === 0) {
    throw new Error("Không có bài báo nào để phân tích.");
  }

  const sheetApp = SpreadsheetApp.getActiveSpreadsheet();

  if (articles.length === 1) {
    // 1 bài báo -> phân tích khung tin đơn lẻ, ghi 1 dòng vào sheet riêng.
    sheetApp.toast("Đang phân tích khung tin tức...", "📰 Đang xử lý", -1);

    const article = articles[0];
    const response = UrlFetchApp.fetch(backendUrl + "/api/analyze-news", {
      method: "post",
      contentType: "application/json",
      headers: getBackendHeaders(),
      payload: JSON.stringify({
        api_key: apiKey,
        text: article.text,
        source_name: article.source,
        published_date: article.date
      }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Lỗi từ Backend: " + response.getContentText());
    }

    const jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse.status !== "success" || !jsonResponse.data) {
      throw new Error("Dữ liệu trả về không hợp lệ.");
    }

    const result = jsonResponse.data;
    const sheet = getOrCreateSheet("Phân tích Tin tức", [
      "Nguồn/Tòa soạn", "Ngày đăng", "Khung chủ đạo", "Giọng điệu",
      "Nguồn trích dẫn", "Dấu hiệu thiên kiến", "Tóm tắt", "Ghi chú lý thuyết"
    ]);

    const citedSources = Array.isArray(result.cited_sources) ? result.cited_sources.join("; ") : (result.cited_sources || "");

    sheet.appendRow([
      article.source || "N/A",
      article.date || "N/A",
      result.dominant_frame || "N/A",
      result.tone || "N/A",
      citedSources || "N/A",
      result.bias_indicators || "N/A",
      result.summary || "N/A",
      result.theory_notes || "N/A"
    ]);

    sheetApp.toast("Đã ghi kết quả phân tích vào sheet 'Phân tích Tin tức'!", "✅ Thành công", 5);

  } else {
    // 2-3 bài báo -> so sánh khung tin, xuất báo cáo ra Google Doc (giống Matrix Synthesis).
    sheetApp.toast("Đang so sánh khung tin giữa " + articles.length + " bài báo...", "📰 Đang xử lý", -1);

    const response = UrlFetchApp.fetch(backendUrl + "/api/compare-news", {
      method: "post",
      contentType: "application/json",
      headers: getBackendHeaders(),
      payload: JSON.stringify({
        api_key: apiKey,
        articles: articles.map(a => ({ source: a.source || "Không rõ", text: a.text }))
      }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Lỗi từ Backend: " + response.getContentText());
    }

    const jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse.status !== "success" || !jsonResponse.report) {
      throw new Error("Dữ liệu trả về không hợp lệ.");
    }

    const doc = DocumentApp.create("So sánh Khung Tin tức - " + new Date().toLocaleDateString());
    doc.getBody().insertParagraph(0, jsonResponse.report);
    const docUrl = doc.getUrl();

    const htmlOutput = HtmlService.createHtmlOutput('<p>✅ So sánh thành công!</p><p>Mở báo cáo tại đây: <a href="' + docUrl + '" target="_blank">Báo cáo So sánh Khung Tin tức</a></p>')
      .setWidth(350)
      .setHeight(150);
    ui.showModalDialog(htmlOutput, 'Hoàn thành So sánh Khung Tin tức');
  }

  return { status: "success" };
}

// =================================================================
// 🎙️ 12. MÃ HOÁ PHỎNG VẤN (THEMATIC CODING)
// =================================================================
function openInterviewCodingDialog() {
  const html = HtmlService.createHtmlOutputFromFile('interview_coding_dialog')
      .setWidth(600)
      .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

function processInterviewCoding(transcript, intervieweeRole) {
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const backendUrl = userProperties.getProperty('BACKEND_URL');

  if (!apiKey || !backendUrl) {
    throw new Error("Bạn chưa cấu hình đủ Gemini API Key hoặc Backend URL!");
  }

  const sheetApp = SpreadsheetApp.getActiveSpreadsheet();
  sheetApp.toast("Đang mã hoá transcript phỏng vấn...", "🎙️ Đang xử lý", -1);

  const response = UrlFetchApp.fetch(backendUrl + "/api/code-interview", {
    method: "post",
    contentType: "application/json",
    headers: getBackendHeaders(),
    payload: JSON.stringify({
      api_key: apiKey,
      transcript: transcript,
      interviewee_role: intervieweeRole
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("Lỗi từ Backend: " + response.getContentText());
  }

  const jsonResponse = JSON.parse(response.getContentText());
  if (jsonResponse.status !== "success" || !jsonResponse.data) {
    throw new Error("Dữ liệu trả về không hợp lệ.");
  }

  const result = jsonResponse.data;
  const themes = Array.isArray(result.themes) ? result.themes : [];

  if (themes.length === 0) {
    throw new Error("Không mã hoá được chủ đề nào từ transcript này.");
  }

  const sheet = getOrCreateSheet("Mã hoá Phỏng vấn", [
    "Người phỏng vấn/Vai trò", "Chủ đề", "Mô tả", "Trích dẫn minh hoạ", "Ghi chú tần suất"
  ]);

  themes.forEach(theme => {
    const quotes = Array.isArray(theme.supporting_quotes) ? theme.supporting_quotes.join("\n") : (theme.supporting_quotes || "");
    sheet.appendRow([
      intervieweeRole || "N/A",
      theme.theme || "N/A",
      theme.description || "N/A",
      quotes || "N/A",
      theme.prevalence_note || "N/A"
    ]);
  });

  sheetApp.toast(`Đã mã hoá ${themes.length} chủ đề vào sheet 'Mã hoá Phỏng vấn'!`, "✅ Thành công", 5);
  return { status: "success" };
}

// =================================================================
// 📊 14. TÍNH ĐỘ TIN CẬY GIỮA 2 NGƯỜI MÃ HOÁ (COHEN'S KAPPA)
// =================================================================
// Thuần Apps Script, không gọi Backend - đây là phép tính thống kê đơn giản, không
// cần AI. Đọc 2 cột liền kề đang được bôi đen trong sheet (mã của Coder A và Coder B,
// cùng số dòng, cùng thứ tự item) và tính % đồng thuận + Cohen's Kappa.
function calculateInterCoderReliability() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();

  if (!range || range.getNumColumns() !== 2) {
    ui.alert("⚠️ Vui lòng bôi đen đúng 2 cột liền kề: cột mã của Coder A và cột mã của Coder B (cùng số dòng, cùng thứ tự item).");
    return;
  }

  const values = range.getValues();
  const codesA = [];
  const codesB = [];
  for (let i = 0; i < values.length; i++) {
    const a = String(values[i][0]).trim();
    const b = String(values[i][1]).trim();
    if (!a && !b) continue; // bỏ qua dòng trống
    codesA.push(a);
    codesB.push(b);
  }

  if (codesA.length === 0) {
    ui.alert("⚠️ Không có dữ liệu hợp lệ trong vùng đã chọn.");
    return;
  }

  const result = computeCohenKappa(codesA, codesB);

  let interpretation;
  if (result.kappa < 0) interpretation = "Kém (Poor)";
  else if (result.kappa <= 0.20) interpretation = "Nhẹ (Slight)";
  else if (result.kappa <= 0.40) interpretation = "Vừa phải (Fair)";
  else if (result.kappa <= 0.60) interpretation = "Trung bình (Moderate)";
  else if (result.kappa <= 0.80) interpretation = "Đáng kể (Substantial)";
  else interpretation = "Gần như hoàn hảo (Almost Perfect)";

  let message = `📊 KẾT QUẢ ĐỘ TIN CẬY MÃ HOÁ (${codesA.length} item):\n\n` +
    `• Tỷ lệ đồng thuận (Observed Agreement): ${(result.observedAgreement * 100).toFixed(1)}%\n` +
    `• Cohen's Kappa: ${result.kappa.toFixed(3)}\n` +
    `• Mức độ tin cậy (thang Landis & Koch): ${interpretation}\n`;

  if (result.disagreements.length > 0) {
    const preview = result.disagreements.slice(0, 10)
      .map(d => `  - Dòng ${d.index + 1}: "${d.a}" ≠ "${d.b}"`)
      .join("\n");
    message += `\n⚠️ ${result.disagreements.length} dòng bất đồng` +
      (result.disagreements.length > 10 ? " (hiển thị 10 dòng đầu)" : "") + `:\n${preview}`;
  } else {
    message += "\n✅ Không có dòng nào bất đồng.";
  }

  ui.alert(message);
}

// Công thức Cohen's Kappa chuẩn: κ = (P_observed - P_expected) / (1 - P_expected)
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

  // Nếu 2 người mã hoá hoàn toàn giống nhau ở mọi item (kể cả khi chỉ có 1 nhãn duy
  // nhất), quy ước Kappa = 1 (không chia 0/0).
  const kappa = expectedAgreement >= 1
    ? 1
    : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);

  return { observedAgreement, expectedAgreement, kappa, disagreements };
}

// =================================================================
// 📝 12. TÍCH HỢP NOTEBOOKLM
// =================================================================
function openNotebookLMDialog() {
  var html = HtmlService.createHtmlOutputFromFile('notebooklm_dialog')
      .setWidth(600)
      .setHeight(450);
  SpreadsheetApp.getUi()
      .showModalDialog(html, ' ');
}

function processNotebookLMText(text) {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');

  if (!apiKey) {
    throw new Error("Bạn chưa cấu hình Gemini API Key trong phần Cài đặt!");
  }

  const sheetApp = SpreadsheetApp.getActiveSpreadsheet();
  sheetApp.toast(`Đang gọi trực tiếp Google Gemini để xử lý (Bỏ qua Backend)...`, 'Đang xử lý', -1);
  
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
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "low" }
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;

  let response;
  let responseCode;
  let responseText;
  let retries = 6;
  let backoff = 3000; // start with 3s
  
  while (retries > 0) {
    try {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      responseText = response.getContentText();
      
      if (responseCode === 200) {
        break; // Success
      } else if (responseCode === 503 || responseCode === 429) {
        // Transient error or rate limit, retry
        retries--;
        if (retries === 0) throw new Error(`Lỗi từ Gemini API: ${responseText}`);
        console.warn(`Gemini API overloaded (503/429). Retrying in ${backoff}ms... (${retries} retries left)`);
        Utilities.sleep(backoff);
        backoff *= 2; // 3s, 6s, 12s, 24s, 48s, 96s
      } else {
        // Other errors (e.g. 400 Bad Request)
        throw new Error(`Lỗi từ Gemini API: ${responseText}`);
      }
    } catch (e) {
      if (retries === 0 || (!e.message.includes("503") && !e.message.includes("429") && !e.message.includes("timeout"))) {
        throw new Error(`Lỗi kết nối Gemini API (Đã thử lại nhiều lần nhưng server AI vẫn quá tải): ${e.message}`);
      }
      retries--;
      Utilities.sleep(backoff);
      backoff *= 2;
    }
  }
    
  try {
    const jsonRes = JSON.parse(responseText);
    if (!jsonRes.candidates || jsonRes.candidates.length === 0) {
      throw new Error("Không có dữ liệu trả về từ Gemini. Có thể do chính sách an toàn.");
    }
    
    const rawContent = jsonRes.candidates[0].content?.parts?.[0]?.text;
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
    
    const sheet = sheetApp.getActiveSheet();
    
    let detailedFindingsStr = "";
    if (result.detailedFindings && Array.isArray(result.detailedFindings)) {
      detailedFindingsStr = result.detailedFindings.map(item => 
        `[${item.location || 'N/A'}] ${item.content || ''}`
      ).join('\n\n');
    } else if (result.detailedFindings) {
      detailedFindingsStr = String(result.detailedFindings);
    }

    let keyFindingsStr = result.keyFindings || "";
    if (Array.isArray(keyFindingsStr)) {
      keyFindingsStr = keyFindingsStr.join('\n');
    }

    const newRow = [
      "Dán từ NotebookLM",
      "Thủ công",
      "", // PDF Link
      result.authors || "",
      result.year || "",
      result.title || "",
      result.journal || "",
      result.apa7 || "",
      result.theory || "",
      result.methodology || "",
      result.sampleSize || "",
      keyFindingsStr,
      result.researchGap || "",
      result.limitations || "",
      detailedFindingsStr,
      result.originalQuote || "",
      result.translatedQuote || ""
    ];
    
    sheet.appendRow(newRow);
    sheetApp.toast(`Đã chèn dữ liệu thành công!`, 'Thành công', 5);
    return {status: 'success'};

  } catch (e) {
    sheetApp.toast(e.toString(), 'Lỗi', 10);
    throw e;
  }
}

// =================================================================
// 🚀 13. TÍCH HỢP NOTEBOOKLM (Ghi dữ liệu từ Web App)
// =================================================================
function appendNotebookLMRow(result) {
  try {
    const sheetApp = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = sheetApp.getActiveSheet();
    
    let detailedFindingsStr = "";
    if (result.detailedFindings && Array.isArray(result.detailedFindings)) {
      detailedFindingsStr = result.detailedFindings.map(item => 
        `[${item.location || 'N/A'}] ${item.content || ''}`
      ).join('\n\n');
    } else if (result.detailedFindings) {
      detailedFindingsStr = String(result.detailedFindings);
    }

    let keyFindingsStr = result.keyFindings || "";
    if (Array.isArray(keyFindingsStr)) {
      keyFindingsStr = keyFindingsStr.join('\n');
    }

    const newRow = [
      "Dán từ NotebookLM (Web App)",
      "Thủ công",
      "", // PDF Link
      result.authors || "",
      result.year || "",
      result.title || "",
      result.journal || "",
      result.apa7 || "",
      result.theory || "",
      result.methodology || "",
      result.sampleSize || "",
      keyFindingsStr,
      result.researchGap || "",
      result.limitations || "",
      detailedFindingsStr,
      result.originalQuote || "",
      result.translatedQuote || ""
    ];
    
    sheet.appendRow(newRow);
    
    // Formatting thẩm mỹ cho dòng mới
    const lastRow = sheet.getLastRow();
    const newRange = sheet.getRange(lastRow, 1, 1, 17);
    newRange.setWrap(true)
            .setVerticalAlignment("top")
            .setBorder(true, true, true, true, true, true, null, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
            
    // Alternating colors
    if (lastRow % 2 === 0) {
      newRange.setBackground("#f8fafc"); // light slate
    } else {
      newRange.setBackground("#ffffff");
    }

    return { status: "success" };
  } catch (error) {
    throw new Error(error.message);
  }
}

