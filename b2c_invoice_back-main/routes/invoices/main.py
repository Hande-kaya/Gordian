from flask import request
from flask_restx import Resource
import traceback

from routes.invoices import invoice_ns
from services.invoice_service import InvoiceService
from utils.auth import token_required
from utils.validators import safe_string_param

invoice_service = InvoiceService()

@invoice_ns.route('')
class InvoiceList(Resource):
    """List all invoices"""
    
    @invoice_ns.doc('list_invoices')
    @token_required
    def get(self):
        """Get paginated list of all invoices for company"""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            
            if not company_id:
                return {'success': False, 'message': 'Company ID required'}, 400
                
            page = int(request.args.get('page', 1))
            page_size = int(request.args.get('page_size', 20))
            match_status = safe_string_param(
                request.args.get('match_status'),
                ('matched', 'unmatched', 'discrepancy'),
            )

            # Use repository direct access for list
            result = invoice_service.repository.get_invoices_by_company(
                company_id=company_id,
                page=page,
                page_size=page_size,
                match_status=match_status
            )
            
            # Transform results
            transformed_invoices = []
            for inv in result['invoices']:
                # Optimized transform without DB call if possible
                transformed = invoice_service._transform_invoice(inv, 0) # 0 as placeholder
                transformed_invoices.append(transformed)
                
            return {
                'success': True,
                'data': {
                    'invoices': transformed_invoices,
                    'total': result['total'],
                    'page': result['page'],
                    'page_size': result['page_size'],
                    'has_next': result['has_next']
                }
            }
            
        except Exception as e:
            traceback.print_exc()
            return {'success': False, 'message': str(e)}, 500

@invoice_ns.route('/invoice/<string:invoice_id>')
class InvoiceDetail(Resource):
    """Get or delete a specific invoice"""

    @invoice_ns.doc('get_invoice')
    @token_required
    def get(self, invoice_id):
        """Get invoice details by ID"""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            result = invoice_service.get_invoice(
                invoice_id=invoice_id,
                user_id=user_id,
                company_id=company_id
            )

            if not result:
                return {'success': False, 'message': 'Invoice not found'}, 404

            return {
                'success': True,
                'data': result
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500

    @invoice_ns.doc('delete_invoice')
    @token_required
    def delete(self, invoice_id):
        """Delete an invoice"""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            success = invoice_service.delete_invoice(
                invoice_id=invoice_id,
                user_id=user_id,
                company_id=company_id
            )

            if not success:
                return {'success': False, 'message': 'Invoice not found or access denied'}, 404

            return {
                'success': True,
                'message': 'Invoice deleted successfully'
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500
