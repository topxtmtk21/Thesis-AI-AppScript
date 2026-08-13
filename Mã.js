// =================================================================
// 🌐 0. TRIỂN KHAI WEB APP (doGet) - Updated
// =================================================================
// =================================================================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Academic AI Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// =================================================================
// 🖥️ 1. TẠO MENU GIAO DIỆN TRÊN GOOGLE SHEETS
// =================================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 Công cụ Luận án')
    .addItem('🚀 1. Khởi tạo Bảng dữ liệu', 'setupSheet')
    .addItem('⚙️ 2. Cấu hình API Key & Folder ID', 'configureSettings')
    .addItem('🔗 3. Cập nhật Link Backend (Ngrok)', 'configureBackendUrl')
    .addItem('⚡ 4. Chạy Phân tích Tài liệu', 'processNewDocuments')
    .addItem('📋 5. Xem Cấu hình Hiện tại', 'showCurrentSettings')
    .addSeparator()
    .addItem('🔍 6. Kiểm tra lỗi API (Chẩn đoán)', 'runDiagnostics')
    .addSeparator()
    .addItem('💬 7. Chat với Trợ lý AI (RAG)', 'openChatSidebar')
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

  ui.alert('✅ Đã lưu cấu hình thành công! Thông tin này sẽ được bảo mật và dùng cho các lần chạy sau.');
}

// =================================================================
// 🔗 2.5. GIAO DIỆN CẬP NHẬT NHANH BACKEND URL (NGROK)
// =================================================================
function configureBackendUrl() {
  const ui = SpreadsheetApp.getUi();
  const userProperties = PropertiesService.getUserProperties();
  
  const currentBackendUrl = userProperties.getProperty('BACKEND_URL') || '';
  const backendResponse = ui.prompt(
    'Cập nhật Link Backend (Ngrok)',
    `Nhập đường link Ngrok mới nhất của bạn (Ví dụ: https://xxxx.ngrok-free.app)\n(Hiện tại: ${currentBackendUrl || 'Chưa thiết lập'}):`,
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
      ui.alert('✅ Đã cập nhật Link Backend thành công!');
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

  const message = `📌 THÔNG TIN CẤU HÌNH HIỆN TẠI:\n\n` +
    `• Gemini API Key: ${apiKey ? '✅ Đã lưu (***' + apiKey.slice(-4) + ')' : '❌ Chưa thiết lập'}\n` +
    `• Pinecone API Key: ${pineconeKey ? '✅ Đã lưu (***' + pineconeKey.slice(-4) + ')' : '❌ Chưa thiết lập'}\n` +
    `• Drive Folder ID: ${folderId ? '✅ ' + folderId : '❌ Chưa thiết lập'}\n` +
    `• Backend URL: ${backendUrl ? '✅ ' + backendUrl : '❌ Chưa thiết lập'}`;

  ui.alert(message);
}

// =================================================================
// 📐 3. HÀM KHỞI TẠO TIÊU ĐỀ CỘT & ĐỊNH DẠNG BẢNG
// =================================================================
function setupSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  const headers = [
    [
      "Tên File", 
      "Tác giả & Năm", 
      "Tạp chí/NXB",
      "Trích dẫn APA 7th", 
      "Khung lý thuyết", 
      "Phương pháp nghiên cứu",
      "Cỡ mẫu (Sample)",
      "Kết quả chính",
      "Research Gap", 
      "Hạn chế (Limitations)",
      "Trích dẫn gốc (Ngoại ngữ)",
      "Trích dẫn (Dịch tiếng Việt)"
    ]
  ];
  
  const range = sheet.getRange(1, 1, 1, 12);
  range.setValues(headers);
  
  range.setFontWeight("bold")
       .setBackground("#d9ead3")
       .setHorizontalAlignment("center");
       
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(5, 200);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 100);
  sheet.setColumnWidth(8, 200);
  sheet.setColumnWidth(9, 200);
  sheet.setColumnWidth(10, 200);
  sheet.setColumnWidth(11, 250);
  sheet.setColumnWidth(12, 250);
  
  SpreadsheetApp.getUi().alert("✅ Đã khởi tạo xong Bảng dữ liệu Luận án (Phiên bản Tiến sĩ)!");
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
    let processedCount = 0;
    const MAX_FILES = 5; 

    while (files.hasNext() && processedCount < MAX_FILES) {
      const file = files.next();
      
      // Hỗ trợ cả PDF, Word, và ảnh chụp
      if (!allowedMimeTypes.includes(file.getMimeType())) continue;
      
      if (file.getDescription() && file.getDescription().includes("PROCESSED")) continue;

      const sheetApp = SpreadsheetApp.getActiveSpreadsheet();
      
      try {
        // Bước 1: Trích xuất Text bằng Google Drive OCR
        sheetApp.toast(`Đang bóc tách chữ từ: ${file.getName()}`, '⏳ Đang quét OCR', -1);
        const textContext = extractTextFromFile(file.getId());
        
        if (!textContext || textContext.trim().length === 0) {
           sheet.appendRow([file.getName(), "⚠️ KHÔNG CÓ KẾT QUẢ", "File rỗng hoặc hệ thống không thể trích xuất được chữ.", "", ""]);
           file.setDescription("PROCESSED - Lỗi OCR - " + new Date().toISOString());
           processedCount++;
           continue;
        }

        // Bước 2: Đẩy xuống Backend để gọi Gemini AI, lưu Vector DB & Knowledge Graph
        if (!backendUrl) {
          ui.alert("⚠️ Bạn chưa cấu hình Backend URL! Không thể phân tích tài liệu.");
          return;
        }
        
        sheetApp.toast(`Đang gửi dữ liệu sang Backend để AI phân tích: ${file.getName()}`, '🤖 Đang xử lý', -1);
        
        const payload = {
          filename: file.getName(),
          text: textContext,
          api_key: apiKey,
          pinecone_api_key: pineconeKey
        };
        
        const response = UrlFetchApp.fetch(backendUrl + "/api/analyze-and-process", {
          method: "post",
          contentType: "application/json",
          headers: { 'ngrok-skip-browser-warning': '69420' },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        
        if (response.getResponseCode() !== 200) {
           sheet.appendRow([file.getName(), "⚠️ LỖI BACKEND", response.getContentText(), "", ""]);
        } else {
           const jsonResponse = JSON.parse(response.getContentText());
           if (jsonResponse.status === "success" && jsonResponse.data) {
             const result = jsonResponse.data;
             sheet.appendRow([
               file.getName(),
               result.authorYear || "N/A",
               result.journal || "N/A",
               result.apa7 || "N/A",
               result.theory || "N/A",
               result.methodology || "N/A",
               result.sampleSize || "N/A",
               result.keyFindings || "N/A",
               result.researchGap || "N/A",
               result.limitations || "N/A",
               result.originalQuote || "N/A",
               result.translatedQuote || "N/A"
             ]);
           } else {
             sheet.appendRow([file.getName(), "⚠️ LỖI PHÂN TÍCH JSON TỪ BACKEND", "", "", ""]);
           }
        }
        
        file.setDescription("PROCESSED - " + new Date().toISOString());
        processedCount++;

      } catch (innerError) {
         sheet.appendRow([file.getName(), "⚠️ LỖI XỬ LÝ", innerError.toString(), "", ""]);
         file.setDescription("PROCESSED - Có lỗi - " + new Date().toISOString());
         processedCount++;
      }
    }

    if (files.hasNext()) {
      ui.alert(`⏳ Đã phân tích ${processedCount} file.\n\nHãy chạy lại Menu > "Chạy Phân tích" để xử lý tiếp các file còn lại.`);
    } else if (processedCount > 0) {
      ui.alert(`🎉 Hoàn thành! Đã phân tích xong ${processedCount} tài liệu mới.`);
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
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
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

function processChat(question) {
  const userProperties = PropertiesService.getUserProperties();
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const apiKey = userProperties.getProperty('GEMINI_API_KEY');
  const pineconeKey = userProperties.getProperty('PINECONE_API_KEY');

  if (!backendUrl || !apiKey || !pineconeKey) {
    throw new Error("Bạn chưa cấu hình đủ Backend URL hoặc các API Key!");
  }

  const payload = {
    question: question,
    api_key: apiKey,
    pinecone_api_key: pineconeKey
  };

  const response = UrlFetchApp.fetch(backendUrl + "/api/chat", {
    method: "post",
    contentType: "application/json",
    headers: { 'ngrok-skip-browser-warning': '69420' },
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
function saveConfigToProperties(backendUrl, geminiKey, pineconeKey) {
  const userProperties = PropertiesService.getUserProperties();
  if (backendUrl) userProperties.setProperty('BACKEND_URL', backendUrl);
  if (geminiKey) userProperties.setProperty('GEMINI_API_KEY', geminiKey);
  if (pineconeKey) userProperties.setProperty('PINECONE_API_KEY', pineconeKey);
  return true;
}