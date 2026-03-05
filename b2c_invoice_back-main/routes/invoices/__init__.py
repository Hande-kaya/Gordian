from flask_restx import Namespace

invoice_ns = Namespace('invoices', description='Invoice operations')

# Import routes to register them with namespace
from routes.invoices import main
from routes.invoices import upload
from routes.invoices import rfq_integration
# matching.py removed - invoice-checker specific functionality
from routes.invoices import attachments
