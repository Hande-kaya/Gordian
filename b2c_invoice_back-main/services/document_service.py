"""
Document Service - Business logic for document operations.

Provides access to the documents collection (shared with invoice-checker).
Supports multi-document splitting and cascade delete.
"""

import atexit
from concurrent.futures import ThreadPoolExecutor

from bson import ObjectId
from database import get_db
from datetime import datetime
import logging
import os

from repositories.reconciliation_repository import ReconciliationRepository

logger = logging.getLogger(__name__)

# Bounded thread pool for background OCR — prevents unbounded thread spawning
_ocr_executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix='ocr')
atexit.register(_ocr_executor.shutdown, wait=False)

ALLOWED_EXTENSIONS = {
    '.pdf', '.png', '.jpg', '.jpeg',
    '.webp', '.heic', '.heif', '.bmp', '.gif', '.tiff', '.tif',
    '.xlsx', '.xls',
}
EXCEL_EXTENSIONS = {'.xlsx', '.xls'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

_MIME_MAP = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
}


def _ext_to_mime(ext: str) -> str:
    return _MIME_MAP.get(ext.lower(), f'image/{ext.lstrip(".").lower()}')


class DocumentService:
    """Service for document operations with multi-doc support."""

    def __init__(self):
        self.db = None
        self._document_ai = None
        self._llm_extraction = None

    def _get_db(self):
        """Lazy database connection"""
        if self.db is None:
            self.db = get_db()
        return self.db

    def get_documents(
        self, company_id: str, doc_type: str = None,
        page: int = 1, page_size: int = 20
    ) -> dict:
        """Get paginated documents. Hides parent containers."""
        db = self._get_db()

        query = {
            'company_id': ObjectId(company_id),
            'multi_document.is_parent': {'$ne': True},
            'deleted_at': {'$exists': False}
        }
        if doc_type:
            query['type'] = doc_type

        page_size = min(max(1, page_size), 100)
        page = max(1, page)
        skip = (page - 1) * page_size

        # Exclude heavy fields not needed for list view
        list_projection = {'extracted_text': 0, 'ocr_index': 0}

        total = db.documents.count_documents(query)
        cursor = (
            db.documents.find(query, list_projection)
            .sort('created_at', -1)
            .skip(skip)
            .limit(page_size)
        )

        return {
            'documents': [self._transform_document(d) for d in cursor],
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_next': (page * page_size) < total,
            'has_prev': page > 1
        }

    def get_document(self, document_id: str, company_id: str) -> dict:
        """Get single document by ID with ownership check."""
        db = self._get_db()
        try:
            doc = db.documents.find_one({
                '_id': ObjectId(document_id),
                'company_id': ObjectId(company_id)
            })
            return self._transform_document(doc) if doc else None
        except Exception as e:
            logger.error(f"Get document error: {e}")
            return None

    def get_document_file(self, document_id: str, company_id: str) -> dict:
        """Get file_ref, filename and mime info for download.

        For child documents without file_ref, falls back to parent.
        Returns dict with file_ref, filename, mime_type or None.
        """
        db = self._get_db()
        try:
            doc = db.documents.find_one(
                {'_id': ObjectId(document_id),
                 'company_id': ObjectId(company_id)},
                {'file_ref': 1, 'filename': 1, 'mime_type': 1,
                 'parent_document_id': 1}
            )
            if not doc:
                return None

            file_ref = doc.get('file_ref')
            if not file_ref and doc.get('parent_document_id'):
                parent = db.documents.find_one(
                    {'_id': doc['parent_document_id'],
                     'company_id': ObjectId(company_id)},
                    {'file_ref': 1, 'filename': 1, 'mime_type': 1}
                )
                if parent:
                    file_ref = parent.get('file_ref')

            if not file_ref:
                return None

            from gridfs import GridFS
            fs = GridFS(db)
            file_data = fs.get(file_ref).read()
            return {
                'data': file_data,
                'filename': doc.get('filename', 'document.pdf'),
                'mime_type': doc.get('mime_type', 'application/pdf')
            }
        except Exception as e:
            logger.error(f"Get document file error: {e}")
            return None

    def upload_document(
        self, file, doc_type: str, user_id: str, company_id: str
    ) -> dict:
        """Upload a document, store in GridFS, trigger background OCR."""
        from utils.file_validation import validate_file_content, validate_mime_type

        db = self._get_db()

        try:
            filename = file.filename
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                raise ValueError(
                    f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
                )

            file_content = file.read()
            file_size = len(file_content)
            if file_size > MAX_FILE_SIZE:
                raise ValueError(
                    f'File too large. Max: {MAX_FILE_SIZE // (1024*1024)}MB'
                )
            if file_size == 0:
                raise ValueError('File is empty')

            # Validate magic bytes — real content must match extension
            content_error = validate_file_content(file_content, ext)
            if content_error:
                raise ValueError(content_error)

            # Validate MIME type consistency
            mime_error = validate_mime_type(
                file.content_type or '', ext
            )
            if mime_error:
                logger.warning(f"MIME mismatch (non-blocking): {mime_error}")

            from gridfs import GridFS
            fs = GridFS(db)
            mime_type = _ext_to_mime(ext)
            file_ref = fs.put(
                file_content, filename=filename,
                content_type=mime_type
            )

            now = datetime.utcnow()
            is_excel = ext in EXCEL_EXTENSIONS
            doc = {
                'company_id': ObjectId(company_id),
                'user_id': ObjectId(user_id),
                'type': doc_type,
                'filename': filename,
                'file_size': file_size,
                'file_ref': file_ref,
                'mime_type': mime_type,
                'ocr_status': 'pending',
                'extraction_status': 'pending',
                'created_at': now,
                'updated_at': now
            }

            result = db.documents.insert_one(doc)
            doc['_id'] = result.inserted_id
            doc_id_str = str(result.inserted_id)
            logger.info(f"Document uploaded: {filename} ({file_size} bytes)")

            # Free file_content — background thread reads from GridFS
            del file_content

            if is_excel:
                _ocr_executor.submit(
                    self._run_excel_extraction,
                    doc_id_str, str(file_ref), filename, doc_type
                )
            else:
                _ocr_executor.submit(
                    self._run_ocr_from_gridfs,
                    doc_id_str, str(file_ref), filename, mime_type
                )

            return self._transform_document(doc)

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Upload error: {e}")
            return None

    def _run_excel_extraction(
        self, document_id: str, file_ref_str: str,
        filename: str, doc_type: str = None
    ):
        """Background: Read Excel from GridFS → text → LLM extraction."""
        db = get_db()
        try:
            db.documents.update_one(
                {'_id': ObjectId(document_id)},
                {'$set': {
                    'ocr_status': 'processing',
                    'updated_at': datetime.utcnow()
                }}
            )

            # Read doc_type from DB if not provided (reprocess/retry path)
            if not doc_type:
                doc = db.documents.find_one(
                    {'_id': ObjectId(document_id)}, {'type': 1}
                )
                doc_type = doc.get('type', 'invoice') if doc else 'invoice'

            from gridfs import GridFS
            fs = GridFS(db)
            file_content = fs.get(ObjectId(file_ref_str)).read()

            from services.excel_extraction_service import extract_from_bytes
            result = extract_from_bytes(file_content, filename, doc_type)

            text = result.get('extracted_text', '')
            data = result.get('extracted_data', {})
            self._set_ocr_completed(db, document_id, text, data)
            logger.info(f"Excel extraction completed for {filename}")

        except Exception as e:
            logger.error(f"Excel extraction error for {filename}: {e}")
            try:
                self._set_ocr_failed(db, document_id, str(e))
            except Exception:
                pass

    def _run_ocr_from_gridfs(
        self, document_id: str, file_ref_str: str,
        filename: str, mime_type: str
    ):
        """Background: Read from GridFS → OCR → LLM → multi-doc split.

        Reads file from GridFS to avoid holding bytes in the upload thread.
        """
        db = get_db()
        try:
            from gridfs import GridFS
            fs = GridFS(db)
            grid_out = fs.get(ObjectId(file_ref_str))
            file_content = grid_out.read()
        except Exception as e:
            logger.error(f"GridFS read failed for {filename}: {e}")
            try:
                self._set_ocr_failed(db, document_id, f'File read error: {e}')
            except Exception:
                pass
            return

        self._run_ocr_background(document_id, file_content, filename, mime_type)

    def _run_ocr_background(
        self, document_id: str, file_content: bytes,
        filename: str, mime_type: str
    ):
        """Background: OCR → LLM extraction → multi-doc split."""
        db = get_db()
        try:
            db.documents.update_one(
                {'_id': ObjectId(document_id)},
                {'$set': {
                    'ocr_status': 'processing',
                    'updated_at': datetime.utcnow()
                }}
            )

            # Step 1: OCR
            if self._document_ai is None:
                from services.document_ai_service import get_document_ai_service
                self._document_ai = get_document_ai_service()

            ocr_result = self._document_ai.process_document_bytes(
                file_content, mime_type
            )
            if not ocr_result.get('success'):
                error_msg = ocr_result.get('error', 'OCR failed')
                logger.error(f"OCR failed for {filename}: {error_msg}")
                self._set_ocr_failed(db, document_id, error_msg)
                return

            ocr_text = ocr_result['ocr_text']
            ocr_index = ocr_result['ocr_index']
            page_count = ocr_result['page_count']

            logger.info(
                f"OCR result for {filename}: {len(ocr_text)} chars, "
                f"{page_count} pages, {len(ocr_index.get('blocks', []))} blocks"
            )

            if not ocr_text.strip():
                logger.warning(f"Empty OCR text for {filename} — saving empty result")
                self._set_ocr_completed(db, document_id, '', {})
                return

            # Step 2: LLM extraction + multi-doc detection
            if self._llm_extraction is None:
                from services.llm_extraction_service import get_llm_extraction_service
                self._llm_extraction = get_llm_extraction_service()

            # Read doc_type from DB for extraction branching
            doc = db.documents.find_one(
                {'_id': ObjectId(document_id)}, {'type': 1}
            )
            doc_type = doc.get('type', 'invoice') if doc else 'invoice'

            llm_result = self._llm_extraction.extract_from_ocr(
                ocr_text, ocr_index, page_count, doc_type=doc_type
            )

            extracted_data = llm_result['extracted_data']
            multi_doc = llm_result['multi_document']
            extracted_documents = llm_result.get('extracted_documents')

            # Step 3: Handle result (skip multi-doc for bank statements)
            if doc_type != 'bank-statement' and multi_doc.get('detected') and extracted_documents:
                self._handle_multi_document_result(
                    db, document_id, ocr_text, extracted_documents, multi_doc
                )
            else:
                self._set_ocr_completed(
                    db, document_id, ocr_text, extracted_data,
                    ocr_index=ocr_index, page_count=page_count
                )

            logger.info(f"OCR+LLM completed for {filename}")

        except Exception as e:
            logger.error(f"OCR background error for {filename}: {e}")
            try:
                self._set_ocr_failed(db, document_id, str(e))
            except Exception:
                pass

    def _handle_multi_document_result(
        self, db, parent_id: str, ocr_text: str,
        extracted_documents: list, multi_doc_info: dict
    ):
        """Create child documents for ALL extracted docs. Parent = container."""
        parent = db.documents.find_one({'_id': ObjectId(parent_id)})
        if not parent:
            return

        child_ids = []
        for idx, doc_data in enumerate(extracted_documents):
            boundary = doc_data.pop('_boundary', None)
            doc_data.pop('_split_index', None)

            child = self._create_split_document(
                db, parent, idx, doc_data, boundary
            )
            if child:
                child_ids.append(child)

        # Mark parent as container
        multi_doc_info['is_parent'] = True
        multi_doc_info['child_document_ids'] = [
            ObjectId(cid) for cid in child_ids
        ]
        db.documents.update_one(
            {'_id': ObjectId(parent_id)},
            {'$set': {
                'multi_document': multi_doc_info,
                'extracted_text': ocr_text,
                'ocr_status': 'completed',
                'extraction_status': 'completed',
                'updated_at': datetime.utcnow()
            }}
        )
        logger.info(
            f"Multi-doc: created {len(child_ids)} children for {parent_id}"
        )

    def _create_split_document(
        self, db, parent: dict, split_index: int,
        extracted_data: dict, boundary: dict = None
    ) -> str:
        """Create a child document sharing the parent's file."""
        now = datetime.utcnow()
        child = {
            'company_id': parent['company_id'],
            'user_id': parent['user_id'],
            'type': parent['type'],
            'filename': self._split_filename(parent['filename'], split_index),
            'file_ref': parent['file_ref'],
            'file_size': parent['file_size'],
            'mime_type': parent.get('mime_type', 'application/pdf'),
            'ocr_status': 'completed',
            'extraction_status': 'completed',
            'extracted_data': extracted_data,
            'expense_category': extracted_data.get('expense_category'),
            'parent_document_id': parent['_id'],
            'split_index': split_index,
            'multi_document': {
                'detected': True,
                'is_child': True,
                'boundaries': [boundary] if boundary else []
            },
            'created_at': now,
            'updated_at': now
        }
        result = db.documents.insert_one(child)
        return str(result.inserted_id) if result.inserted_id else None

    @staticmethod
    def _split_filename(filename: str, split_index: int) -> str:
        """Insert _split_N before the extension to preserve file type."""
        dot = filename.rfind('.')
        if dot > 0:
            return f"{filename[:dot]}_split_{split_index + 1}{filename[dot:]}"
        return f"{filename}_split_{split_index + 1}"

    def delete_document(self, document_id: str, company_id: str) -> bool:
        """Soft-delete document (sets deleted_at). Cascade to children."""
        db = self._get_db()
        try:
            doc_oid = ObjectId(document_id)
            company_oid = ObjectId(company_id)
        except Exception:
            return False

        doc = db.documents.find_one(
            {'_id': doc_oid, 'company_id': company_oid, 'deleted_at': {'$exists': False}}
        )
        if not doc:
            return False

        now = datetime.utcnow()
        multi_doc = doc.get('multi_document', {})

        # If parent: soft-delete all children too
        if multi_doc.get('is_parent'):
            child_ids = multi_doc.get('child_document_ids', [])
            if child_ids:
                db.documents.update_many(
                    {'_id': {'$in': child_ids}},
                    {'$set': {'deleted_at': now}}
                )

        db.documents.update_one(
            {'_id': doc_oid},
            {'$set': {'deleted_at': now}}
        )

        # Cascade: remove reconciliation matches referencing this document
        try:
            recon_repo = ReconciliationRepository()
            deleted = recon_repo.delete_matches_by_document_id(document_id, company_id)
            if deleted:
                logger.info(f"Cascade-deleted {deleted} reconciliation matches for doc {document_id}")
        except Exception as e:
            logger.warning(f"Failed to cascade-delete recon matches: {e}")

        logger.info(f"Soft-deleted document: {document_id}")
        return True

    def restore_document(self, document_id: str, company_id: str) -> bool:
        """Restore a soft-deleted document. Also restores children."""
        db = self._get_db()
        try:
            doc_oid = ObjectId(document_id)
            company_oid = ObjectId(company_id)
        except Exception:
            return False

        doc = db.documents.find_one(
            {'_id': doc_oid, 'company_id': company_oid, 'deleted_at': {'$exists': True}}
        )
        if not doc:
            return False

        multi_doc = doc.get('multi_document', {})
        if multi_doc.get('is_parent'):
            child_ids = multi_doc.get('child_document_ids', [])
            if child_ids:
                db.documents.update_many(
                    {'_id': {'$in': child_ids}},
                    {'$unset': {'deleted_at': ''}}
                )

        db.documents.update_one({'_id': doc_oid}, {'$unset': {'deleted_at': ''}})
        logger.info(f"Restored document: {document_id}")
        return True

    def permanent_delete_documents(self, document_ids: list, company_id: str) -> int:
        """Mark trash documents as permanently deleted (user can no longer restore)."""
        db = self._get_db()
        try:
            company_oid = ObjectId(company_id)
            doc_oids = [ObjectId(did) for did in document_ids]
        except Exception:
            return 0

        now = datetime.utcnow()
        query = {
            '_id': {'$in': doc_oids},
            'company_id': company_oid,
            'deleted_at': {'$exists': True},
            'permanently_deleted': {'$ne': True},
        }
        docs = list(db.documents.find(query))
        if not docs:
            return 0

        ids_to_update = [d['_id'] for d in docs]
        # Cascade: collect children of parent docs
        for doc in docs:
            multi = doc.get('multi_document', {})
            if multi.get('is_parent'):
                child_ids = multi.get('child_document_ids', [])
                ids_to_update.extend(child_ids)

        result = db.documents.update_many(
            {'_id': {'$in': ids_to_update}},
            {'$set': {'permanently_deleted': True, 'permanently_deleted_at': now}}
        )

        # Cascade: remove reconciliation matches for all deleted docs
        try:
            recon_repo = ReconciliationRepository()
            for did in ids_to_update:
                recon_repo.delete_matches_by_document_id(str(did), company_id)
        except Exception as e:
            logger.warning(f"Failed to cascade-delete recon matches on perm-delete: {e}")

        logger.info(f"Permanently deleted {result.modified_count} documents")
        return result.modified_count

    def get_deleted_documents(
        self, company_id: str, page: int = 1, page_size: int = 20,
        doc_type: str = None
    ) -> dict:
        """Get soft-deleted documents visible to user (last 30 days)."""
        from datetime import timedelta
        db = self._get_db()
        cutoff = datetime.utcnow() - timedelta(days=30)

        query = {
            'company_id': ObjectId(company_id),
            'deleted_at': {'$exists': True, '$gte': cutoff},
            'multi_document.is_parent': {'$ne': True},
            'permanently_deleted': {'$ne': True}
        }
        if doc_type:
            query['type'] = doc_type
        page_size = min(max(1, page_size), 100)
        page = max(1, page)
        skip = (page - 1) * page_size

        list_projection = {'extracted_text': 0, 'ocr_index': 0}

        total = db.documents.count_documents(query)
        cursor = (
            db.documents.find(query, list_projection)
            .sort('deleted_at', -1)
            .skip(skip)
            .limit(page_size)
        )
        return {
            'documents': [self._transform_document(d) for d in cursor],
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_next': (page * page_size) < total,
            'has_prev': page > 1
        }

    def cancel_processing(self, document_id: str, company_id: str) -> bool:
        """Cancel a pending/processing document. Returns True if cancelled."""
        db = self._get_db()
        result = db.documents.update_one(
            {'_id': ObjectId(document_id),
             'company_id': ObjectId(company_id),
             'ocr_status': {'$in': ['pending', 'processing']},
             'deleted_at': {'$exists': False}},
            {'$set': {'ocr_status': 'cancelled',
                      'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0

    def reprocess_pending(self, company_id: str) -> int:
        """Re-trigger OCR on pending/failed documents.

        Marks stale processing docs (>5 min) as failed first,
        then reads from GridFS in each thread to avoid RAM spike.
        """
        from datetime import timedelta
        db = self._get_db()

        # Zombie detection: mark stale processing docs as failed
        stale_cutoff = datetime.utcnow() - timedelta(minutes=5)
        stale = db.documents.update_many(
            {'company_id': ObjectId(company_id),
             'ocr_status': 'processing',
             'updated_at': {'$lt': stale_cutoff}},
            {'$set': {'ocr_status': 'failed',
                      'ocr_error': 'Processing timed out',
                      'updated_at': datetime.utcnow()}}
        )
        if stale.modified_count:
            logger.warning(
                f"Marked {stale.modified_count} stale processing docs as failed"
            )

        docs = list(db.documents.find(
            {'company_id': ObjectId(company_id),
             'ocr_status': {'$in': ['pending', 'failed', 'cancelled']},
             'file_ref': {'$exists': True}},
            {'_id': 1, 'filename': 1, 'file_ref': 1}
        ).limit(20))
        count = 0
        for doc in docs:
            try:
                fn = doc.get('filename', '')
                ext = os.path.splitext(fn)[1].lower()
                if ext in EXCEL_EXTENSIONS:
                    _ocr_executor.submit(
                        self._run_excel_extraction,
                        str(doc['_id']), str(doc['file_ref']), fn
                    )
                else:
                    mime = _ext_to_mime(ext)
                    _ocr_executor.submit(
                        self._run_ocr_from_gridfs,
                        str(doc['_id']), str(doc['file_ref']), fn, mime
                    )
                count += 1
            except Exception as e:
                logger.error(f"Reprocess error for {doc['_id']}: {e}")
        return count

    def retry_document(self, document_id: str, company_id: str) -> bool:
        """Retry OCR on a single failed/cancelled document."""
        db = self._get_db()
        doc = db.documents.find_one(
            {'_id': ObjectId(document_id),
             'company_id': ObjectId(company_id),
             'ocr_status': {'$in': ['failed', 'cancelled']},
             'file_ref': {'$exists': True}},
            {'_id': 1, 'filename': 1, 'file_ref': 1}
        )
        if not doc:
            return False
        fn = doc.get('filename', '')
        ext = os.path.splitext(fn)[1].lower()
        if ext in EXCEL_EXTENSIONS:
            _ocr_executor.submit(
                self._run_excel_extraction,
                str(doc['_id']), str(doc['file_ref']), fn
            )
        else:
            mime = _ext_to_mime(ext)
            _ocr_executor.submit(
                self._run_ocr_from_gridfs,
                str(doc['_id']), str(doc['file_ref']), fn, mime
            )
        return True

    def update_document_fields(
        self, document_id: str, company_id: str, fields: dict
    ) -> bool:
        """Update extracted data fields (dual storage)."""
        db = self._get_db()

        try:
            doc_oid = ObjectId(document_id)
            company_oid = ObjectId(company_id)
        except Exception:
            return False

        if not db.documents.find_one(
            {'_id': doc_oid, 'company_id': company_oid}, {'_id': 1}
        ):
            return False

        set_ops = {'updated_at': datetime.utcnow()}
        array_filters = []
        idx = 0

        for field_name, value in fields.items():
            for path in _FIELD_MAPPING.get(field_name, []):
                set_ops[path] = value
            entity_type = _FIELD_TO_ENTITY.get(field_name)
            if entity_type:
                alias = f'e{idx}'
                set_ops[f'extracted_data.entities_with_bounds.$[{alias}].value'] = str(value)
                array_filters.append({f'{alias}.type': entity_type})
                idx += 1

        kwargs = {'array_filters': array_filters} if array_filters else {}
        result = db.documents.update_one(
            {'_id': doc_oid}, {'$set': set_ops}, **kwargs
        )

        # Re-normalize amounts if currency/amount/date changed
        _RETRIGGER_FIELDS = {'currency', 'total_amount', 'net_amount', 'invoice_date'}
        if _RETRIGGER_FIELDS & set(fields.keys()):
            self._renormalize_amounts(db, doc_oid, company_oid)

        return result.modified_count > 0

    @staticmethod
    def _renormalize_amounts(db, doc_oid, company_oid):
        """Re-calculate normalized_amount after user edits currency/amount/date."""
        try:
            from services.exchange_rate_service import (
                normalize_document_amounts, normalize_transaction,
            )
            doc = db.documents.find_one(
                {'_id': doc_oid, 'company_id': company_oid},
                {'extracted_data': 1, 'type': 1},
            )
            if not doc:
                return
            ed = doc.get('extracted_data') or {}
            doc_type = doc.get('type', 'invoice')

            if doc_type == 'bank-statement':
                # Re-normalize all transactions
                currency = ed.get('currency')
                txs = ed.get('transactions') or []
                for tx in txs:
                    normalize_transaction(tx, currency)
                db.documents.update_one(
                    {'_id': doc_oid},
                    {'$set': {'extracted_data.transactions': txs}},
                )
            else:
                result = normalize_document_amounts(ed)
                db.documents.update_one(
                    {'_id': doc_oid},
                    {'$set': {
                        'extracted_data.normalized_amount': ed.get('normalized_amount'),
                        'extracted_data.normalized_currency': ed.get('normalized_currency'),
                        'extracted_data.exchange_rate_used': ed.get('exchange_rate_used'),
                    }},
                )
        except Exception as e:
            logger.warning(f"Re-normalization failed for {doc_oid}: {e}")

    def _transform_document(self, doc: dict) -> dict:
        """Transform MongoDB document to API format."""
        parent_id = doc.get('parent_document_id')
        return {
            'id': str(doc['_id']),
            'company_id': str(doc.get('company_id', '')),
            'user_id': str(doc.get('user_id', '')),
            'type': doc.get('type', 'invoice'),
            'filename': doc.get('filename', ''),
            'file_size': doc.get('file_size', 0),
            'ocr_status': doc.get('ocr_status', 'pending'),
            'extraction_status': doc.get('extraction_status', 'pending'),
            'extraction_error': doc.get('extraction_error'),
            'extracted_text': doc.get('extracted_text'),
            'extracted_data': doc.get('extracted_data'),
            'comparison': doc.get('comparison'),
            'ocr_error': doc.get('ocr_error'),
            'multi_document': doc.get('multi_document'),
            'parent_document_id': str(parent_id) if parent_id else None,
            'expense_category': doc.get('expense_category'),
            'created_at': (
                doc['created_at'].isoformat()
                if doc.get('created_at') else None
            ),
            'updated_at': (
                doc['updated_at'].isoformat()
                if doc.get('updated_at') else None
            ),
            'deleted_at': (
                doc['deleted_at'].isoformat()
                if doc.get('deleted_at') else None
            ),
        }

    @staticmethod
    def _set_ocr_completed(
        db, document_id, ocr_text, extracted_data,
        ocr_index=None, page_count=None
    ):
        """Helper: mark OCR as completed."""
        update = {
            'ocr_status': 'completed', 'extraction_status': 'completed',
            'extracted_text': ocr_text, 'extracted_data': extracted_data,
            'ocr_error': None, 'updated_at': datetime.utcnow(),
        }
        if ocr_index is not None:
            update['ocr_index'] = ocr_index
        if page_count is not None:
            update['page_count'] = page_count
        cat = extracted_data.get('expense_category') if extracted_data else None
        if cat:
            update['expense_category'] = cat
        db.documents.update_one({'_id': ObjectId(document_id)}, {'$set': update})

    @staticmethod
    def _set_ocr_failed(db, document_id, error_msg):
        """Helper: mark OCR as failed."""
        db.documents.update_one(
            {'_id': ObjectId(document_id)},
            {'$set': {
                'ocr_status': 'failed',
                'ocr_error': error_msg,
                'updated_at': datetime.utcnow(),
            }}
        )


# Field mapping: field_name -> [extracted_data paths]
_ed = 'extracted_data'
_FIELD_MAPPING = {
    'supplier_name': [f'{_ed}.supplier_name', f'{_ed}.vendor.name'],
    'supplier_tax_id': [f'{_ed}.supplier_tax_id', f'{_ed}.vendor.tax_id'],
    'supplier_address': [f'{_ed}.supplier_address', f'{_ed}.vendor.address'],
    'supplier_email': [f'{_ed}.supplier_email'],
    'supplier_phone': [f'{_ed}.supplier_phone'],
    'supplier_website': [f'{_ed}.supplier_website'],
    'supplier_iban': [f'{_ed}.supplier_iban'],
    'receiver_name': [f'{_ed}.receiver_name'],
    'receiver_address': [f'{_ed}.receiver_address'],
    'invoice_number': [f'{_ed}.invoice_number'],
    'invoice_type': [f'{_ed}.invoice_type'],
    'invoice_date': [f'{_ed}.invoice_date'],
    'due_date': [f'{_ed}.due_date'],
    'total_amount': [f'{_ed}.total_amount', f'{_ed}.financials.total_amount'],
    'currency': [f'{_ed}.currency', f'{_ed}.financials.currency'],
    'total_tax_amount': [f'{_ed}.total_tax_amount', f'{_ed}.financials.tax'],
    'net_amount': [f'{_ed}.net_amount', f'{_ed}.financials.subtotal'],
    'expense_category': ['expense_category'],
    # Bank statement fields
    'bank_name': [f'{_ed}.bank_name'],
    'account_number': [f'{_ed}.account_number'],
    'statement_date': [f'{_ed}.statement_date'],
    'opening_balance': [f'{_ed}.opening_balance'],
    'closing_balance': [f'{_ed}.closing_balance'],
    'total_debits': [f'{_ed}.total_debits'],
    'total_credits': [f'{_ed}.total_credits'],
}
_FIELD_TO_ENTITY = {
    'invoice_number': 'invoice_id', 'invoice_type': 'invoice_type',
    'invoice_date': 'invoice_date', 'due_date': 'due_date',
    'supplier_name': 'supplier_name', 'supplier_address': 'supplier_address',
    'supplier_tax_id': 'supplier_tax_id', 'supplier_email': 'supplier_email',
    'supplier_phone': 'supplier_phone', 'supplier_website': 'supplier_website',
    'supplier_iban': 'supplier_iban', 'receiver_name': 'receiver_name',
    'receiver_address': 'receiver_address', 'total_amount': 'total_amount',
    'net_amount': 'net_amount', 'total_tax_amount': 'total_tax_amount',
    'currency': 'currency',
}


# Singleton instance
_document_service = None


def get_document_service() -> DocumentService:
    """Get singleton DocumentService instance"""
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service
