from app.utils.google_auth import get_google_service
from googleapiclient.http import MediaFileUpload
import os

class DriveManager:
    def __init__(self):
        self.service = get_google_service('drive', 'v3')
        self.root_folder_name = "Academic_AI_Workspace"
        self.folders = {
            "01_ChuaXuLy": None,
            "02_DangXuLy": None,
            "03_DaXuLy": None
        }
        self.root_id = self._get_or_create_folder(self.root_folder_name)
        for f in self.folders.keys():
            self.folders[f] = self._get_or_create_folder(f, self.root_id)

    def _get_or_create_folder(self, name, parent_id=None):
        query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        
        results = self.service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        items = results.get('files', [])
        
        if items:
            return items[0]['id']
        else:
            file_metadata = {
                'name': name,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            if parent_id:
                file_metadata['parents'] = [parent_id]
            folder = self.service.files().create(body=file_metadata, fields='id').execute()
            return folder.get('id')

    def upload_file_to_processed(self, file_path, filename):
        """Tải file PDF lên thư mục 03_DaXuLy"""
        processed_folder_id = self.folders["03_DaXuLy"]
        file_metadata = {
            'name': filename,
            'parents': [processed_folder_id]
        }
        media = MediaFileUpload(file_path, mimetype='application/pdf')
        
        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        
        return file.get('id')
