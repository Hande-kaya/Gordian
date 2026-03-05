from flask import request
from flask_restx import Resource

from routes.invoices import invoice_ns
from services.rfq_service import RFQService
from services.invoice_service import InvoiceService
from utils.auth import token_required

rfq_service = RFQService()
invoice_service = InvoiceService()

@invoice_ns.route('/completed-rfqs')
class CompletedRFQs(Resource):
    """Get completed RFQs for invoice upload"""

    @invoice_ns.doc('get_completed_rfqs')
    @token_required
    def get(self):
        """
        Get paginated list of completed RFQs.
        """
        try:
            user = request.current_user
            company_id = user.get('company_id')
            
            # Check if user is admin
            is_admin = user.get('role') == 'admin' or user.get('is_admin', False)
            
            # Handle both flat company_id and nested company object
            if not company_id and 'company' in user and isinstance(user['company'], dict):
                company_id = user['company'].get('_id')
            
            if not company_id and not is_admin:
                return {'success': False, 'message': 'User company not found'}, 400

            page = int(request.args.get('page', 1))
            page_size = int(request.args.get('page_size', 20))

            result = rfq_service.get_completed_rfqs(
                company_id=company_id if not is_admin else None,
                page=page,
                page_size=page_size
            )

            return {
                'success': True,
                'data': result.model_dump(mode='json')
            }

        except ValueError as e:
            return {'success': False, 'message': f'Invalid parameters: {str(e)}'}, 400
        except Exception as e:
            return {'success': False, 'message': str(e)}, 500


@invoice_ns.route('/completed-rfqs/<string:rfq_id>')
class CompletedRFQDetail(Resource):
    """Get detailed information about a completed RFQ"""

    @invoice_ns.doc('get_completed_rfq_detail')
    @token_required
    def get(self, rfq_id):
        """Get detailed RFQ information including offers and products."""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            result = rfq_service.get_rfq_detail(
                rfq_id=rfq_id,
                user_id=user_id,
                company_id=company_id
            )

            if not result:
                return {'success': False, 'message': 'RFQ not found or access denied'}, 404

            return {
                'success': True,
                'data': result.model_dump(mode='json')
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500


@invoice_ns.route('/rfq/<string:rfq_id>/invoices')
class RFQInvoices(Resource):
    """Get all invoices for an RFQ"""

    @invoice_ns.doc('get_rfq_invoices')
    @token_required
    def get(self, rfq_id):
        """Get all invoices uploaded for a specific RFQ"""
        try:
            user = request.current_user
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            invoices = invoice_service.get_invoices_for_rfq(
                rfq_id=rfq_id,
                company_id=company_id
            )

            return {
                'success': True,
                'data': {
                    'invoices': invoices,
                    'total': len(invoices)
                }
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500
