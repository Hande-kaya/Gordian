from flask import request
from flask_restx import Resource
import traceback

from routes.invoices import invoice_ns
from services.invoice_service import InvoiceService
from utils.auth import token_required

invoice_service = InvoiceService()

@invoice_ns.route('/<string:rfq_id>/upload')
class InvoiceUpload(Resource):
    """Upload an invoice for an RFQ"""

    @invoice_ns.doc('upload_invoice')
    @invoice_ns.expect(invoice_ns.parser().add_argument('file', location='files', type='file', required=True))
    @token_required
    def post(self, rfq_id):
        """
        Upload an invoice file for a completed RFQ.

        Form Data:
        - file: Invoice file (PDF, PNG, JPG) - Max 10MB
        - notes: Optional notes (optional)

        The invoice will be stored and linked to the RFQ.
        """
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')
            is_admin = user.get('role') == 'admin' or user.get('is_admin', False)

            # Admin users may not have company_id, we'll get it from RFQ
            if not company_id and not is_admin:
                return {'success': False, 'message': 'User company not found'}, 400

            # Get file from request
            if 'file' not in request.files:
                return {'success': False, 'message': 'No file provided'}, 400

            file = request.files['file']
            if file.filename == '':
                return {'success': False, 'message': 'No file selected'}, 400

            # Get optional notes
            notes = request.form.get('notes', '')

            # Upload invoice (pass is_admin flag)
            result = invoice_service.upload_invoice(
                rfq_id=rfq_id,
                file=file,
                user_id=user_id,
                company_id=company_id,
                notes=notes if notes else None,
                is_admin=is_admin
            )

            if not result:
                return {'success': False, 'message': 'Failed to upload invoice'}, 500

            return {
                'success': True,
                'data': result,
                'message': 'Invoice uploaded successfully'
            }, 201

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500
