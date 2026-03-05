"""Document Routes — upload, list, get, edit, delete, reprocess."""

from flask import request
from flask_restx import Namespace, Resource
import logging

from services.document_service import get_document_service
from utils.auth import token_required
from utils.rate_limit import rate_limit
from utils.validators import safe_string_param

DOC_TYPE_WHITELIST = ('invoice', 'quote', 'income', 'bank-statement')

logger = logging.getLogger(__name__)

document_ns = Namespace('documents', description='Document operations')


@document_ns.route('/upload')
class DocumentUpload(Resource):
    @document_ns.doc('upload_document')
    @token_required
    def post(self):
        """Upload a document (invoice/quote/income/bank-statement)."""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            # Quota check
            from services.usage_service import get_usage_service
            quota = get_usage_service().check_upload_quota(user_id, company_id)
            if not quota['allowed']:
                return {'success': False, 'message': quota['message'], 'code': 'QUOTA_EXCEEDED'}, 402

            # Get file
            if 'file' not in request.files:
                return {'success': False, 'message': 'No file provided'}, 400

            file = request.files['file']
            if file.filename == '':
                return {'success': False, 'message': 'No file selected'}, 400

            # Get type (default to invoice)
            doc_type = request.form.get('type', 'invoice')
            if doc_type not in ('invoice', 'quote', 'income', 'bank-statement'):
                return {'success': False, 'message': 'Type must be invoice, quote, income, or bank-statement'}, 400

            # Upload document
            document_service = get_document_service()
            result = document_service.upload_document(
                file=file,
                doc_type=doc_type,
                user_id=user_id,
                company_id=company_id
            )

            if not result:
                return {'success': False, 'message': 'Failed to upload document'}, 500

            # Consume upload quota
            get_usage_service().consume_upload(user_id, company_id)

            return {
                'success': True,
                'data': result,
                'message': 'Document uploaded successfully'
            }, 201

        except ValueError as e:
            return {'success': False, 'message': str(e)}, 400
        except Exception as e:
            logger.error(f"Upload error: {e}")
            return {'success': False, 'message': 'Upload failed'}, 500


@document_ns.route('')
class DocumentList(Resource):
    @document_ns.doc('list_documents')
    @token_required
    def get(self):
        """Get paginated list of documents."""
        try:
            user = request.current_user
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            page = int(request.args.get('page', 1))
            page_size = int(request.args.get('page_size', 20))
            doc_type = safe_string_param(request.args.get('type'), DOC_TYPE_WHITELIST)

            document_service = get_document_service()
            result = document_service.get_documents(
                company_id=company_id,
                doc_type=doc_type,
                page=page,
                page_size=page_size
            )

            return {
                'success': True,
                'data': result
            }

        except ValueError as e:
            return {'success': False, 'message': f'Invalid parameters: {str(e)}'}, 400
        except Exception as e:
            logger.error(f"List error: {e}")
            return {'success': False, 'message': 'Failed to list documents'}, 500


EDITABLE_FIELDS = {
    'vendor_name': str, 'supplier_tax_id': str, 'supplier_address': str,
    'supplier_email': str, 'supplier_phone': str, 'supplier_website': str,
    'supplier_iban': str, 'receiver_name': str, 'receiver_address': str,
    'invoice_number': str, 'invoice_type': str, 'invoice_date': str,
    'due_date': str, 'total_amount': float, 'currency': str,
    'total_tax_amount': float, 'net_amount': float, 'expense_category': str,
    'bank_name': str, 'account_number': str, 'statement_date': str,
    'opening_balance': float, 'closing_balance': float,
    'total_debits': float, 'total_credits': float,
}
FIELD_NAME_MAP = {'vendor_name': 'supplier_name'}


@document_ns.route('/<string:document_id>/fields')
class DocumentFieldsUpdate(Resource):
    @document_ns.doc('update_document_fields')
    @token_required
    def patch(self, document_id):
        """Update specific extracted data fields."""
        try:
            user = request.current_user
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            data = request.get_json()
            if not data or 'fields' not in data:
                return {'success': False, 'message': 'fields object required'}, 400

            # Validate and coerce fields
            validated: dict = {}
            for key, value in data['fields'].items():
                if key not in EDITABLE_FIELDS:
                    return {
                        'success': False,
                        'message': f'Field not editable: {key}'
                    }, 400
                try:
                    coerced = EDITABLE_FIELDS[key](value) if value else value
                except (ValueError, TypeError):
                    return {
                        'success': False,
                        'message': f'Invalid type for {key}'
                    }, 400
                repo_key = FIELD_NAME_MAP.get(key, key)
                validated[repo_key] = coerced

            document_service = get_document_service()
            success = document_service.update_document_fields(
                document_id, company_id, validated
            )

            if not success:
                return {'success': False, 'message': 'Document not found or update failed'}, 404

            return {
                'success': True,
                'message': 'Fields updated'
            }

        except Exception as e:
            logger.error(f"Update fields error: {e}")
            return {'success': False, 'message': 'Failed to update fields'}, 500


@document_ns.route('/reprocess-pending')
class DocumentReprocessPending(Resource):
    @document_ns.doc('reprocess_pending')
    @token_required
    @rate_limit(max_requests=5, window=60)
    def post(self):
        """Trigger OCR on all pending documents for this company."""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            # Check regenerate quota for pending docs
            from services.usage_service import get_usage_service
            usage_svc = get_usage_service()
            regen_quota = usage_svc.check_regenerate_quota(user_id, company_id)
            if not regen_quota['allowed']:
                return {'success': False, 'message': regen_quota['message'], 'code': 'QUOTA_EXCEEDED'}, 402

            document_service = get_document_service()
            count = document_service.reprocess_pending(company_id)

            # Consume one regenerate credit per reprocessed doc
            for _ in range(count):
                usage_svc.consume_regenerate(user_id, company_id)

            return {
                'success': True,
                'data': {'reprocessed': count},
                'message': f'{count} documents queued for OCR'
            }

        except Exception as e:
            logger.error(f"Reprocess error: {e}")
            return {'success': False, 'message': 'Failed to reprocess documents'}, 500


@document_ns.route('/trash')
class DocumentTrash(Resource):
    @document_ns.doc('list_trash')
    @token_required
    def get(self):
        try:
            user = request.current_user
            company_id = user.get('company_id')
            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            page = request.args.get('page', 1, type=int)
            page_size = request.args.get('page_size', 20, type=int)
            doc_type = safe_string_param(request.args.get('type'), DOC_TYPE_WHITELIST)

            document_service = get_document_service()
            result = document_service.get_deleted_documents(company_id, page, page_size, doc_type=doc_type)
            return {'success': True, 'data': result}
        except Exception as e:
            logger.error(f"Trash list error: {e}")
            return {'success': False, 'message': 'Failed to list trash'}, 500


@document_ns.route('/<string:document_id>/download')
class DocumentDownload(Resource):
    @document_ns.doc('download_document')
    @token_required
    def get(self, document_id):
        """Download document file from GridFS."""
        from flask import make_response
        try:
            user = request.current_user
            company_id = user.get('company_id')
            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            try:
                from bson import ObjectId
                ObjectId(document_id)
            except Exception:
                return {'success': False, 'message': 'Invalid document ID'}, 400

            document_service = get_document_service()
            file_info = document_service.get_document_file(
                document_id, company_id
            )
            if not file_info:
                return {'success': False, 'message': 'File not found'}, 404

            resp = make_response(file_info['data'])
            resp.headers['Content-Type'] = file_info['mime_type']
            resp.headers['Content-Length'] = str(len(file_info['data']))

            # Sanitize filename for Content-Disposition (ASCII-only for header safety)
            from urllib.parse import quote
            raw_name = file_info['filename']
            ascii_name = raw_name.encode('ascii', 'ignore').decode('ascii').replace('"', '')
            if not ascii_name.strip():
                ascii_name = 'document.pdf'
            resp.headers['Content-Disposition'] = (
                f"inline; filename=\"{ascii_name}\"; "
                f"filename*=UTF-8''{quote(raw_name)}"
            )
            return resp
        except Exception as e:
            logger.error(f"Download error: {e}")
            return {'success': False, 'message': 'Download failed'}, 500


@document_ns.route('/trash/permanent-delete')
class TrashPermanentDelete(Resource):
    @document_ns.doc('permanent_delete')
    @token_required
    def post(self):
        try:
            user = request.current_user
            company_id = user.get('company_id')
            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            data = request.get_json(silent=True) or {}
            document_ids = data.get('document_ids', [])
            if not document_ids or not isinstance(document_ids, list):
                return {'success': False, 'message': 'document_ids required'}, 400

            from bson import ObjectId
            for did in document_ids:
                try:
                    ObjectId(did)
                except Exception:
                    return {'success': False, 'message': f'Invalid ID: {did}'}, 400

            document_service = get_document_service()
            count = document_service.permanent_delete_documents(document_ids, company_id)
            return {'success': True, 'message': f'{count} documents permanently deleted', 'count': count}
        except Exception as e:
            logger.error(f"Permanent delete error: {e}")
            return {'success': False, 'message': 'Permanent delete failed'}, 500


@document_ns.route('/<string:document_id>/restore')
class DocumentRestore(Resource):
    @document_ns.doc('restore_document')
    @token_required
    def post(self, document_id):
        try:
            user = request.current_user
            company_id = user.get('company_id')
            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            try:
                from bson import ObjectId
                ObjectId(document_id)
            except Exception:
                return {'success': False, 'message': 'Invalid document ID'}, 400

            document_service = get_document_service()
            success = document_service.restore_document(document_id, company_id)
            if not success:
                return {'success': False, 'message': 'Document not found in trash'}, 404
            return {'success': True, 'message': 'Document restored'}
        except Exception as e:
            logger.error(f"Restore error: {e}")
            return {'success': False, 'message': 'Restore failed'}, 500


@document_ns.route('/<string:document_id>/retry')
class DocumentRetry(Resource):
    @token_required
    def post(self, document_id):
        """Retry OCR on a failed/cancelled document."""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            if not company_id:
                return {'success': False, 'message': 'Company not found'}, 400
            try:
                from bson import ObjectId
                ObjectId(document_id)
            except Exception:
                return {'success': False, 'message': 'Invalid document ID'}, 400
            service = get_document_service()
            if service.retry_document(document_id, company_id):
                return {'success': True, 'message': 'Document queued for retry'}
            return {'success': False, 'message': 'Document not found or not retryable'}, 400
        except Exception as e:
            logger.error(f"Retry error: {e}")
            return {'success': False, 'message': 'Retry failed'}, 500


@document_ns.route('/<string:document_id>/cancel-processing')
class DocumentCancelProcessing(Resource):
    @token_required
    def post(self, document_id):
        """Cancel a pending/processing document."""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            if not company_id:
                return {'success': False, 'message': 'Company not found'}, 400
            try:
                from bson import ObjectId
                ObjectId(document_id)
            except Exception:
                return {'success': False, 'message': 'Invalid document ID'}, 400
            service = get_document_service()
            if service.cancel_processing(document_id, company_id):
                return {'success': True, 'message': 'Processing cancelled'}
            return {'success': False, 'message': 'Document not found or already completed'}, 400
        except Exception as e:
            logger.error(f"Cancel processing error: {e}")
            return {'success': False, 'message': 'Cancel failed'}, 500


@document_ns.route('/<string:document_id>')
class DocumentDetail(Resource):
    @document_ns.doc('get_document')
    @token_required
    def get(self, document_id):
        """Get document details."""
        try:
            user = request.current_user
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            document_service = get_document_service()
            result = document_service.get_document(document_id, company_id)

            if not result:
                return {'success': False, 'message': 'Document not found'}, 404

            return {
                'success': True,
                'data': result
            }

        except Exception as e:
            logger.error(f"Get error: {e}")
            return {'success': False, 'message': 'Failed to get document'}, 500

    @document_ns.doc('delete_document')
    @token_required
    def delete(self, document_id):
        """Soft-delete a document (moves to trash)."""
        try:
            user = request.current_user
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            try:
                from bson import ObjectId
                ObjectId(document_id)
            except Exception:
                return {'success': False, 'message': 'Invalid document ID'}, 400

            document_service = get_document_service()
            success = document_service.delete_document(
                document_id, company_id
            )

            if not success:
                return {'success': False, 'message': 'Document not found'}, 404

            return {
                'success': True,
                'message': 'Document moved to trash'
            }

        except Exception as e:
            logger.error(f"Delete error: {e}")
            return {'success': False, 'message': 'Delete failed'}, 500


@document_ns.route('/diag/ocr-status')
class DocumentOCRDiag(Resource):
    @document_ns.doc('ocr_diagnostic')
    @token_required
    def get(self):
        """Check GCP/OCR configuration health."""
        import os
        try:
            creds_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '(not set)')
            creds_exists = os.path.isfile(creds_path) if creds_path != '(not set)' else False

            from services.document_ai_service import get_document_ai_service
            svc = get_document_ai_service()

            return {
                'success': True,
                'data': {
                    'gcp_project_id': svc.project_id,
                    'gcp_location': svc.location,
                    'gcp_processor_id': svc.processor_id,
                    'processor_name': svc.processor_name,
                    'credentials_path': creds_path,
                    'credentials_file_exists': creds_exists,
                    'gcp_json_set': bool(os.getenv('GCP_CREDENTIALS_JSON')),
                    'gcp_b64_set': bool(os.getenv('GCP_CREDENTIALS_BASE64')),
                    'openai_key_set': bool(os.getenv('OPENAI_API_KEY')),
                }
            }
        except Exception as e:
            return {'success': False, 'message': str(e)}, 500
