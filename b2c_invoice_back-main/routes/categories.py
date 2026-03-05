"""
Categories Routes - CRUD API for per-user expense categories.

GET  /api/categories       → list current categories
PUT  /api/categories       → save custom categories
POST /api/categories/reset → reset to defaults
"""

from flask import request
from flask_restx import Namespace, Resource
from utils.auth import token_required

category_ns = Namespace('categories', description='Expense category management')


@category_ns.route('')
class CategoryList(Resource):
    """Get or update expense categories."""

    @category_ns.doc('get_categories')
    @token_required
    def get(self):
        """Return current expense categories for the user's company."""
        from services.category_service import get_categories

        user = request.current_user
        company_id = user.get('company_id')
        if not company_id:
            return {'success': False, 'message': 'User company not found'}, 400

        result = get_categories(company_id)
        return {'success': True, 'data': result}

    @category_ns.doc('update_categories')
    @token_required
    def put(self):
        """Save custom expense categories."""
        from services.category_service import update_categories

        user = request.current_user
        company_id = user.get('company_id')
        if not company_id:
            return {'success': False, 'message': 'User company not found'}, 400

        data = request.get_json()
        if not data or 'categories' not in data:
            return {'success': False, 'message': 'categories array required'}, 400

        result = update_categories(company_id, data['categories'])
        if not result.get('success'):
            return {'success': False, 'message': result.get('message')}, 400

        return {'success': True, 'data': result.get('data')}


@category_ns.route('/reset')
class CategoryReset(Resource):
    """Reset categories to defaults."""

    @category_ns.doc('reset_categories')
    @token_required
    def post(self):
        """Clear custom categories and return defaults."""
        from services.category_service import reset_to_defaults

        user = request.current_user
        company_id = user.get('company_id')
        if not company_id:
            return {'success': False, 'message': 'User company not found'}, 400

        result = reset_to_defaults(company_id)
        return {'success': True, 'data': result}
