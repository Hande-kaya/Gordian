from flask import request
from flask_restx import Resource
from bson import ObjectId

from routes.invoices import invoice_ns
from services.invoice_service import InvoiceService
from services.document_service import document_service
from services.verification_service import get_verification_service
from utils.auth import token_required
from database import get_collection

# Lazy imports to avoid circular deps if needed, but services are safe
invoice_service = InvoiceService()


def get_company_region(company_id: str) -> str:
    """
    Get company's region from database.
    Returns 'tr' as default if not found.
    """
    if not company_id:
        return 'tr'

    try:
        companies = get_collection('companies')
        company = companies.find_one(
            {'_id': ObjectId(company_id)},
            {'region': 1}
        )
        if company and company.get('region'):
            return company['region'].lower()
    except Exception:
        pass

    return 'tr'  # Default to Turkish

@invoice_ns.route('/settings')
class InvoiceSettingsResource(Resource):
    """Manage invoice matching settings"""

    @invoice_ns.doc('get_settings')
    @token_required
    def get(self):
        """Get invoice matching settings"""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            
            if not company_id:
                return {'success': False, 'message': 'Company ID required'}, 400
                
            from database import get_db
            from repositories.settings_repository import get_settings_repository
            
            repo = get_settings_repository(get_db())
            settings = repo.get_settings(company_id)
            
            return {
                'success': True,
                'data': settings.model_dump()
            }
        except Exception as e:
            return {'success': False, 'message': str(e)}, 500

    @invoice_ns.doc('update_settings')
    @token_required
    def put(self):
        """Update invoice matching settings"""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            user_id = user.get('user_id')
            
            if not company_id:
                return {'success': False, 'message': 'Company ID required'}, 400
                
            from database import get_db
            from repositories.settings_repository import get_settings_repository
            from models.settings import InvoiceSettings
            
            data = request.json
            # Ensure company_id is set
            data['company_id'] = company_id
            
            settings = InvoiceSettings(**data)
            
            repo = get_settings_repository(get_db())
            success = repo.update_settings(company_id, settings, user_id)
            
            if success:
                return {'success': True, 'message': 'Settings updated'}
            return {'success': False, 'message': 'Failed to update settings'}, 500
            
        except Exception as e:
            return {'success': False, 'message': str(e)}, 500


@invoice_ns.route('/<string:invoice_id>/link-quote')
class InvoiceLinkQuote(Resource):
    """Link invoice to a specific quote/RFQ"""

    @invoice_ns.doc('link_quote')
    @token_required
    def put(self, invoice_id):
        """
        Manually link invoice to a quote.
        This triggers re-verification.
        """
        try:
            user = request.current_user
            company_id = user.get('company_id')
            data = request.json
            quote_id = data.get('quote_id')
            
            if not quote_id:
                return {'success': False, 'message': 'quote_id is required'}, 400
            
            # Logic:
            # 1. Fetch Invoice
            # 2. Fetch Quote
            # 3. Run Verification (verification service)
            # 4. Update Invoice Comparison with new link and result
            
            invoice = document_service.get_document(invoice_id, company_id)
            quote = document_service.get_document(quote_id, company_id)
            
            if not invoice or not quote:
                return {'success': False, 'message': 'Document not found'}, 404

            # Get company region for language selection
            language = get_company_region(company_id)

            # Verify with language-specific analysis
            verifier = get_verification_service()
            verification_result = verifier.verify_match(invoice, quote, language)
            
            # Prepare update data
            comparison_data = {
                'linked_quote_id': quote_id,
                'status': 'matched' if not verification_result.get('discrepancies') else 'discrepancy',
                'verification_result': verification_result,
                'match_score': 1.0, # Manual match implies 100% confidence in linkage
                'difference': verification_result.get('summary', {}).get('difference_amount'),
                'match_source': 'manual' # Tag source as manual
            }
            
            try:
                 summary = verification_result.get('summary', {})
                 comparison_data['expected_amount'] = summary.get('quote_total')
                 comparison_data['actual_amount'] = summary.get('invoice_total')
            except:
                pass
            
            success = invoice_service.update_invoice_match(invoice_id, company_id, comparison_data)
            
            if success:
                return {'success': True, 'data': comparison_data}
            return {'success': False, 'message': 'Failed to link'}, 500

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500


@invoice_ns.route('/<string:invoice_id>/unlink')
class InvoiceUnlink(Resource):
    """Unlink invoice from quote"""

    @invoice_ns.doc('unlink_quote')
    @token_required
    def post(self, invoice_id):
        """Remove link and comparison data"""
        try:
            user = request.current_user
            company_id = user.get('company_id')
            
            comparison_data = {
                'linked_quote_id': None,
                'status': 'pending',
                'match_score': None,
                'verification_result': None,
                'difference': None,
                'expected_amount': None,
                'actual_amount': None,
                'match_source': None
            }
            
            success = invoice_service.update_invoice_match(invoice_id, company_id, comparison_data)
            
            if success:
                return {'success': True, 'message': 'Unlinked successfully'}
            return {'success': False, 'message': 'Failed to update'}, 500

        except Exception as e:
            return {'success': False, 'message': str(e)}, 500

