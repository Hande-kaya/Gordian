from typing import Optional
from bson import ObjectId
from gridfs import GridFSBucket
from database import get_db

class GridFSMixin:
    """Mixin for GridFS operations"""

    def save_file_to_gridfs(self, file_data: bytes, filename: str, content_type: str = 'application/pdf') -> Optional[str]:
        """
        Save file to GridFS.

        Args:
            file_data: File bytes
            filename: Original filename
            content_type: MIME type (default: application/pdf)

        Returns:
            GridFS file ID or None
        """
        db = get_db()
        if db is None:
            return None

        try:
            fs = GridFSBucket(db)
            file_id = fs.upload_from_stream(
                filename,
                file_data,
                metadata={'contentType': content_type}
            )
            return str(file_id)
        except Exception as e:
            print(f"Error saving to GridFS: {e}")
            return None

    def get_file_from_gridfs(self, file_id: str) -> Optional[bytes]:
        """
        Get file from GridFS.

        Args:
            file_id: GridFS file ID

        Returns:
            File bytes or None
        """
        db = get_db()
        if db is None:
            return None

        try:
            fs = GridFSBucket(db)
            file_oid = ObjectId(file_id)

            # Get file from GridFS
            chunks = []
            with fs.open_download_stream(file_oid) as grid_in:
                for chunk in grid_in:
                    chunks.append(chunk)
            return b''.join(chunks)
        except Exception as e:
            print(f"Error reading from GridFS: {e}")
            return None
