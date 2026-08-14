import time
import requests
import json
import os
import sys

NGROK_API_URL = "http://127.0.0.1:4040/api/tunnels"
CONFIG_FILE = "gas_webhook.json"

def get_ngrok_url():
    """Liên tục kiểm tra Ngrok cho đến khi lấy được link public."""
    print("[WAIT] Dang cho Ngrok khoi dong va cap phat duong dan...")
    for _ in range(15):
        try:
            response = requests.get(NGROK_API_URL, timeout=2)
            if response.status_code == 200:
                data = response.json()
                tunnels = data.get("tunnels", [])
                for tunnel in tunnels:
                    if tunnel.get("proto") == "https":
                        url = tunnel.get("public_url")
                        print(f"[OK] Da lay duoc link Ngrok: {url}")
                        return url
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(2)
    print("[ERROR] Khong the lay link Ngrok. Dam bao Ngrok dang chay.")
    sys.exit(1)

def get_webhook_url():
    """Lấy Web App URL từ file cấu hình, nếu chưa có thì hỏi người dùng."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
            if "webhook_url" in data and data["webhook_url"]:
                return data["webhook_url"]
    
    print("\n" + "="*60)
    print("[!] DAY LA LAN CHAY DAU TIEN CUA TINH NANG TU DONG HOA")
    print("De toi biet cach ket noi voi Google Sheets cua ban, hay cung cap Web App URL.")
    print("1. Mo Google Sheets > Tien ich mo rong > Apps Script")
    print("2. Bam nut 'Trien khai' (Deploy) > 'Trien khai moi' (New deployment)")
    print("3. Chon loai 'Ung dung web' (Web App), quyen truy cap: 'Bat ky ai' (Anyone)")
    print("4. Copy 'URL Ung dung web' va dan vao day.")
    print("="*60)
    
    webhook_url = input("\n-> Dan Web App URL vao day roi nhan Enter: ").strip()
    if not webhook_url.startswith("https://script.google.com/"):
        print("[ERROR] URL khong hop le! Vui long chay lai va nhap dung URL.")
        sys.exit(1)
        
    with open(CONFIG_FILE, "w") as f:
        json.dump({"webhook_url": webhook_url}, f)
    
    return webhook_url

def update_google_sheets(ngrok_url, webhook_url):
    """Gửi link Ngrok mới lên Google Sheets."""
    print("[WAIT] Dang dong bo link vao Google Sheets...")
    try:
        payload = {"ngrokUrl": ngrok_url}
        response = requests.post(webhook_url, json=payload)
        
        if response.status_code == 200:
            try:
                res_data = response.json()
                if res_data.get("status") == "success":
                    print("[SUCCESS] THANH CONG! Link da duoc tu dong cap nhat vao Google Sheets.")
                    print("[INFO] Mo Google Sheets va bam chay [4. Chay Phan tich Tai lieu] ngay thoi!")
                    return
            except:
                pass
        
        print(f"[WARNING] Canh bao: Google Sheets tra ve trang thai {response.status_code}, nhung co the van thanh cong.")
    except Exception as e:
        print(f"[ERROR] Loi khi gui du lieu len Google Sheets: {e}")

if __name__ == "__main__":
    time.sleep(2)
    url = get_ngrok_url()
    webhook = get_webhook_url()
    update_google_sheets(url, webhook)
    print("\n[OK] HE THONG DA SAN SANG! BAN CO THE THU NHO CUA SO NAY.")
