from flask import request
from flask_restx import Resource

from routes.invoices import invoice_ns
from services.rfq_service import RFQService
from utils.auth import token_required

rfq_service = RFQService()  # noqa: used in SupplierAttachments

@invoice_ns.route('/completed-rfqs/<string:rfq_id>/<string:supplier_id>/attachments')
class SupplierAttachments(Resource):
    """Get attachments from a supplier for an RFQ"""

    @invoice_ns.doc('get_supplier_attachments')
    @token_required
    def get(self, rfq_id, supplier_id):
        """Get list of attachments from emails"""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            
            # Check if user is admin
            is_admin = user.get('role') == 'admin' or user.get('is_admin', False)

            # Non-admin users must have company_id
            if not company_id and not is_admin:
                return {'success': False, 'message': 'User company not found'}, 400

            # Validate access to RFQ (skip for admin)
            if not is_admin and not rfq_service.validate_rfq_access(rfq_id, company_id):
                return {'success': False, 'message': 'Access denied'}, 403

            # Get attachments from repository
            print(f"DEBUG ATTACHMENTS: rfq_id={rfq_id}, supplier_id={supplier_id}")
            attachments = rfq_service.repository.get_supplier_attachments(rfq_id, supplier_id)
            print(f"DEBUG ATTACHMENTS: found {len(attachments)} attachments")

            return {
                'success': True,
                'data': attachments
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500


@invoice_ns.route('/attachments/<string:rfq_id>/<string:attachment_id>/download')
class AttachmentDownload(Resource):
    """Download an attachment directly from shared database"""

    @invoice_ns.doc('download_attachment')
    @token_required
    def get(self, rfq_id, attachment_id):
        """Download file from supplier_product_documents collection"""
        try:
            from flask import Response
            from database import get_collection
            import urllib.parse

            user = request.current_user
            company_id = user.get('company_id')
            is_admin = user.get('role') == 'admin' or user.get('is_admin', False)

            # Validate RFQ access before serving the file
            if not is_admin:
                if not company_id:
                    return {'success': False, 'message': 'User company not found'}, 400
                rfq_svc = RFQService()
                if not rfq_svc.validate_rfq_access(rfq_id, company_id):
                    return {'success': False, 'message': 'Access denied'}, 403

            # Get file directly from supplier_product_documents (shared with main backend)
            supplier_docs = get_collection('supplier_product_documents')

            document = supplier_docs.find_one({
                'attachment_id': attachment_id,
                'request_id': rfq_id
            })

            # Fallback: try without request_id
            if not document:
                document = supplier_docs.find_one({
                    'attachment_id': attachment_id
                })
            
            if not document or 'file_data' not in document:
                print(f"DEBUG: Attachment not found in supplier_product_documents")
                return {'success': False, 'message': 'Attachment not found'}, 404
            
            file_data = document['file_data']
            filename = document.get('original_filename', 'attachment')
            content_type = document.get('mime_type', document.get('file_type', 'application/octet-stream'))
            
            # Handle bytes vs string encoding
            if isinstance(file_data, str):
                import base64
                file_data = base64.b64decode(file_data)
            
            encoded_filename = urllib.parse.quote(filename.encode('utf-8'))
            
            print(f"DEBUG: Serving file {filename} ({len(file_data)} bytes)")
            
            return Response(
                file_data,
                mimetype=content_type,
                headers={
                    'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}",
                    'Content-Length': str(len(file_data))
                }
            )

        except Exception as e:
            print(f"DEBUG: Download error: {e}")
            return {'success': False, 'message': str(e)}, 500
