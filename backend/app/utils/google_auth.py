import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

def get_google_service(api_name, api_version):
    creds = None
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    token_path = os.path.join(base_dir, 'token.json')
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            cred_path = os.path.join(base_dir, 'credentials.json')
            if not os.path.exists(cred_path):
                raise FileNotFoundError("Khong tim thay 'credentials.json' trong thu muc backend.")
            flow = InstalledAppFlow.from_client_secrets_file(cred_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, 'w') as token:
            token.write(creds.to_json())

    service = build(api_name, api_version, credentials=creds)
    return service
