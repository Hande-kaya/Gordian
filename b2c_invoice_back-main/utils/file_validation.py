"""
File Validation - Magic bytes + MIME type verification.

Prevents upload of disguised files (e.g. exe renamed to .pdf).
"""

import logging

logger = logging.getLogger(__name__)

# Magic byte signatures for allowed file types
MAGIC_SIGNATURES = {
    'pdf': [b'%PDF'],
    'png': [b'\x89PNG\r\n\x1a\n'],
    'jpg': [b'\xff\xd8\xff\xe0', b'\xff\xd8\xff\xe1', b'\xff\xd8\xff\xe2',
            b'\xff\xd8\xff\xdb', b'\xff\xd8\xff\xee', b'\xff\xd8\xff\xed'],
    'jpeg': None,  # alias
    'webp': [b'RIFF'],  # RIFF....WEBP
    'gif': [b'GIF87a', b'GIF89a'],
    'bmp': [b'BM'],
    'tiff': [b'II\x2a\x00', b'MM\x00\x2a'],  # little-endian / big-endian
    'tif': None,  # alias
    'heic': [b'\x00\x00\x00'],  # ftyp box (checked further by MIME)
    'heif': None,  # alias
    'xlsx': [b'\x50\x4b\x03\x04'],  # ZIP (Office Open XML)
    'xls': [b'\xd0\xcf\x11\xe0'],   # OLE2 Compound Document
}
MAGIC_SIGNATURES['jpeg'] = MAGIC_SIGNATURES['jpg']
MAGIC_SIGNATURES['tif'] = MAGIC_SIGNATURES['tiff']
MAGIC_SIGNATURES['heif'] = MAGIC_SIGNATURES['heic']

# Map extensions to expected MIME types
EXPECTED_MIME_TYPES = {
    '.pdf': ['application/pdf'],
    '.png': ['image/png'],
    '.jpg': ['image/jpeg', 'image/jpg'],
    '.jpeg': ['image/jpeg', 'image/jpg'],
    '.webp': ['image/webp'],
    '.gif': ['image/gif'],
    '.bmp': ['image/bmp', 'image/x-ms-bmp'],
    '.tiff': ['image/tiff'],
    '.tif': ['image/tiff'],
    '.heic': ['image/heic', 'image/heif'],
    '.heif': ['image/heic', 'image/heif'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    '.xls': ['application/vnd.ms-excel'],
}


def validate_file_content(file_content: bytes, extension: str) -> str | None:
    """
    Validate file content matches claimed extension using magic bytes.

    Returns None if valid, error message string if invalid.
    """
    ext_key = extension.lstrip('.').lower()
    signatures = MAGIC_SIGNATURES.get(ext_key)

    if signatures is None:
        return f'Unsupported file type: {extension}'

    # Check magic bytes (first 8 bytes is enough for all our types)
    header = file_content[:8] if len(file_content) >= 8 else file_content

    matched = any(header.startswith(sig) for sig in signatures)
    if not matched:
        logger.warning(
            f"File magic bytes mismatch: claimed={extension}, "
            f"header={header[:8].hex()}"
        )
        return (
            f'File content does not match {extension} format. '
            f'The file may be corrupted or disguised.'
        )

    return None


def validate_mime_type(claimed_mime: str, extension: str) -> str | None:
    """
    Validate that the client-claimed MIME type is consistent with extension.

    Returns None if valid, error message string if invalid.
    """
    expected = EXPECTED_MIME_TYPES.get(extension.lower())
    if not expected:
        return None  # Unknown extension, skip MIME check

    if claimed_mime and claimed_mime.lower() not in expected:
        logger.warning(
            f"MIME type mismatch: claimed={claimed_mime}, "
            f"expected={expected} for ext={extension}"
        )
        return (
            f'MIME type {claimed_mime} does not match file extension {extension}'
        )

    return None
