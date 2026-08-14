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
    .addItem('🚀 1. Khởi tạo Bảng dữ liệu', 'setupSheet')
    .addItem('⚙️ 2. Cấu hình API Key & Folder ID', 'configureSettings')
    .addItem('🔗 3. Cập nhật Link Backend (Ngrok)', 'configureBackendUrl')
    .addItem('⚡ 4. Chạy Phân tích Tài liệu', 'processNewDocuments')
    .addItem('⚡ 4b. Phân tích Nâng cao (Có trang & Tham khảo)', 'processDocumentsAdvanced')
    .addItem('📝 4c. Dán văn bản từ NotebookLM', 'openNotebookLMDialog')
    .addItem('📋 5. Xem Cấu hình Hiện tại', 'showCurrentSettings')
    .addSeparator()
    .addItem('🔍 6. Kiểm tra lỗi API (Chẩn đoán)', 'runDiagnostics')
    .addSeparator()
    .addItem('💬 7. Chat với Trợ lý AI (RAG)', 'openChatSidebar')
    .addSeparator()
    .addItem('🧠 8. Tổng hợp Literature Review (Matrix Synthesis)', 'generateMatrixSynthesis')
    .addItem('📥 9. Xuất file RIS (Zotero/EndNote)', 'exportRis')
    .addItem('🕸️ 10. Xem Đồ thị Kiến thức (Knowledge Graph)', 'showKnowledgeGraph')
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
      "Trích dẫn (Dịch tiếng Việt)",
      "Danh mục Tham khảo (References)"
    ]
  ];
  
  const range = sheet.getRange(1, 1, 1, 13);
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
  sheet.setColumnWidth(13, 300);
  
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
             let findingsText = result.keyFindings || "N/A";
             if (result.detailedFindings && result.detailedFindings.length > 0) {
               findingsText = result.detailedFindings.map(f => `- [${f.location || "Không rõ"}] ${f.content || ""}`).join("\n");
             }
             sheet.appendRow([
               file.getName(),
               result.authorYear || "N/A",
               result.journal || "N/A",
               result.apa7 || "N/A",
               result.theory || "N/A",
               result.methodology || "N/A",
               result.sampleSize || "N/A",
               findingsText,
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
    let processedCount = 0;
    const MAX_FILES = 5; 

    while (files.hasNext() && processedCount < MAX_FILES) {
      const file = files.next();
      
      if (!allowedMimeTypes.includes(file.getMimeType())) continue;
      if (file.getDescription() && file.getDescription().includes("PROCESSED_ADVANCED")) continue;

      const sheetApp = SpreadsheetApp.getActiveSpreadsheet();
      
      try {
        if (!backendUrl) {
          ui.alert("⚠️ Bạn chưa cấu hình Backend URL!");
          return;
        }
        
        sheetApp.toast(`Đang upload PDF sang Backend để phân tích: ${file.getName()}`, '🤖 Đang xử lý', -1);
        
        const payload = {
          file: file.getBlob(),
          api_key: apiKey,
          pinecone_api_key: pineconeKey
        };
        
        const response = UrlFetchApp.fetch(backendUrl + "/api/analyze-pdf-blob", {
          method: "post",
          headers: { 'ngrok-skip-browser-warning': '69420' },
          payload: payload,
          muteHttpExceptions: true
        });
        
        if (response.getResponseCode() !== 200) {
           sheet.appendRow([file.getName(), "⚠️ LỖI BACKEND", response.getContentText(), "", ""]);
        } else {
           const jsonResponse = JSON.parse(response.getContentText());
           if (jsonResponse.status === "success" && jsonResponse.data) {
             const result = jsonResponse.data;
             let findingsText = result.keyFindings || "N/A";
             if (result.detailedFindings && result.detailedFindings.length > 0) {
               findingsText = result.detailedFindings.map(f => `- [${f.location || "Không rõ"}] ${f.content || ""}`).join("\n");
             }
             const bibText = (result.full_bibliography && Array.isArray(result.full_bibliography)) 
                               ? result.full_bibliography.join("\n\n") 
                               : (result.full_bibliography || "N/A");
             sheet.appendRow([
               file.getName(),
               result.authorYear || "N/A",
               result.journal || "N/A",
               result.apa7 || "N/A",
               result.theory || "N/A",
               result.methodology || "N/A",
               result.sampleSize || "N/A",
               findingsText,
               result.researchGap || "N/A",
               result.limitations || "N/A",
               result.originalQuote || "N/A",
               result.translatedQuote || "N/A",
               bibText
             ]);
           } else {
             sheet.appendRow([file.getName(), "⚠️ LỖI PHÂN TÍCH JSON TỪ BACKEND", "", "", ""]);
           }
        }
        
        file.setDescription("PROCESSED_ADVANCED - " + new Date().toISOString());
        processedCount++;

      } catch (innerError) {
         sheet.appendRow([file.getName(), "⚠️ LỖI XỬ LÝ", innerError.toString(), "", ""]);
         file.setDescription("PROCESSED_ADVANCED - Có lỗi - " + new Date().toISOString());
         processedCount++;
      }
    }

    if (files.hasNext()) {
      ui.alert(`⏳ Đã phân tích nâng cao ${processedCount} file.\nHãy chạy lại Menu để tiếp tục.`);
    } else if (processedCount > 0) {
      ui.alert(`🎉 Hoàn thành! Đã phân tích nâng cao ${processedCount} tài liệu mới.`);
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
      headers: { 'ngrok-skip-browser-warning': '69420' },
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
  const backendUrl = userProperties.getProperty('BACKEND_URL');
  const pineconeKey = userProperties.getProperty('PINECONE_API_KEY');

  if (!apiKey || !pineconeKey || !backendUrl) {
    throw new Error("Bạn chưa cấu hình đủ API Key (Gemini, Pinecone) hoặc Backend URL!");
  }

  const sheetApp = SpreadsheetApp.getActiveSpreadsheet();
  sheetApp.toast(`Đang gửi đoạn văn bản sang Backend để xử lý...`, 'Đang xử lý', -1);
  
  const payload = {
    text: text,
    api_key: apiKey,
    pinecone_api_key: pineconeKey
  };
  
  const options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  };
  
  try {
    const backendUrlParsed = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    const response = UrlFetchApp.fetch(`${backendUrlParsed}/api/analyze-raw-text`, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode === 200) {
      const data = JSON.parse(responseBody);
      if (data.status === "success" && data.data) {
        const result = data.data;
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
      } else {
        throw new Error(data.message || 'Lỗi không xác định từ Backend');
      }
    } else {
      let errorMsg = `HTTP Error ${responseCode}`;
      try {
        const errObj = JSON.parse(responseBody);
        errorMsg = errObj.detail || errObj.message || errorMsg;
      } catch (e) {
        errorMsg += `\n${responseBody}`;
      }
      throw new Error(errorMsg);
    }
  } catch (e) {
    sheetApp.toast(e.toString(), 'Lỗi Backend', 10);
    throw e;
  }
}
