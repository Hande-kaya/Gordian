"""
Reconciliation Helpers — document field extraction utilities.
Shared by reconciliation_service and reconciliation_matcher.
"""

from typing import Any, Dict, List, Optional


# Projection for documents — only fields needed for matching.
# Full extracted_data (~200KB/doc with OCR) is NOT needed.
# This cuts memory from ~200MB to ~1MB for 1000 docs.
DOC_PROJECTION = {
    '_id': 1,
    'filename': 1,
    'file_name': 1,
    'type': 1,
    'company_id': 1,
    # Nested extracted_data — only matching-relevant sub-fields
    'extracted_data.financials.total_amount': 1,
    'extracted_data.financials.net_amount': 1,
    'extracted_data.financials.currency': 1,
    'extracted_data.invoice_date': 1,
    'extracted_data.vendor': 1,
    'extracted_data.supplier_name': 1,
    'extracted_data.receiver_name': 1,
    'extracted_data.total_amount': 1,
    'extracted_data.net_amount': 1,
    'extracted_data.currency': 1,
    # Cross-currency normalization fields
    'extracted_data.normalized_amount': 1,
    'extracted_data.normalized_currency': 1,
}


def get_doc_amount(doc: Dict) -> float:
    """Extract primary amount (total_amount) from document."""
    ed = doc.get('extracted_data') or {}
    fin = ed.get('financials') or {}
    val = fin.get('total_amount') or ed.get('total_amount') or 0
    try:
        return abs(float(val))
    except (ValueError, TypeError):
        return 0.0


def get_doc_amounts(doc: Dict) -> list:
    """
    Extract ALL candidate amounts: [total_amount, net_amount].
    Bank may pay total (KDV dahil) or net (KDV haric).
    """
    ed = doc.get('extracted_data') or {}
    fin = ed.get('financials') or {}

    candidates: List[float] = []

    total = fin.get('total_amount') or ed.get('total_amount')
    if total:
        try:
            candidates.append(abs(float(total)))
        except (ValueError, TypeError):
            pass

    net = fin.get('net_amount') or ed.get('net_amount')
    if net:
        try:
            candidates.append(abs(float(net)))
        except (ValueError, TypeError):
            pass

    return candidates if candidates else [0.0]


def get_doc_normalized_amounts(doc: Dict) -> list:
    """
    Extract normalized (EUR) amounts for cross-currency matching.
    Falls back to raw amounts if normalization not available.
    """
    ed = doc.get('extracted_data') or {}
    norm = ed.get('normalized_amount')
    if norm is not None:
        try:
            return [abs(float(norm))]
        except (ValueError, TypeError):
            pass
    # Fallback to raw amounts
    return get_doc_amounts(doc)


def get_doc_date(doc: Dict) -> Optional[str]:
    ed = doc.get('extracted_data') or {}
    return ed.get('invoice_date') or None


def get_doc_vendor(doc: Dict) -> Optional[str]:
    """Supplier/vendor name — for expense matching."""
    ed = doc.get('extracted_data') or {}
    vendor = ed.get('vendor') or {}
    return vendor.get('name') or ed.get('supplier_name') or None


def get_doc_receiver(doc: Dict) -> Optional[str]:
    """Receiver/buyer/customer name — for income matching."""
    ed = doc.get('extracted_data') or {}
    return ed.get('receiver_name') or None


def get_doc_counterparty(doc: Dict, match_type: str) -> Optional[str]:
    """Get relevant counterparty name based on match direction."""
    if match_type == 'income':
        return get_doc_receiver(doc) or get_doc_vendor(doc)
    return get_doc_vendor(doc) or get_doc_receiver(doc)


def get_doc_filename(doc: Dict) -> str:
    return doc.get('filename') or doc.get('file_name') or ''


def tx_to_input(tx: Dict) -> Dict:
    """Convert raw transaction dict to matcher input format.
    Uses normalized_amount (EUR) for cross-currency matching."""
    norm = tx.get('normalized_amount')
    if norm is not None:
        try:
            amount = abs(float(norm))
        except (ValueError, TypeError):
            amount = abs(float(tx.get('amount', 0)))
    else:
        amount = abs(float(tx.get('amount', 0)))

    result = {
        'amount': amount,
        'date': tx.get('date'),
        'description': tx.get('description'),
    }
    if tx.get('vendor_name'):
        result['vendor_name'] = tx['vendor_name']
    # Currency: original (pre-normalization) currency
    if tx.get('original_currency'):
        result['currency'] = tx['original_currency']
    elif tx.get('normalized_currency'):
        result['currency'] = tx['normalized_currency']
    return result


def get_doc_currency(doc: Dict) -> Optional[str]:
    """Extract currency from document."""
    ed = doc.get('extracted_data') or {}
    fin = ed.get('financials') or {}
    return fin.get('currency') or ed.get('currency') or None


def doc_to_input(doc: Dict, match_type: str = 'expense') -> Dict:
    """Convert document dict to matcher input format.
    Uses normalized amounts (EUR) for cross-currency matching."""
    return {
        'amounts': get_doc_normalized_amounts(doc),
        'amount': get_doc_normalized_amounts(doc)[0],
        'date': get_doc_date(doc),
        'vendor_name': get_doc_counterparty(doc, match_type),
        'filename': get_doc_filename(doc),
        'currency': get_doc_currency(doc),
    }


def build_match_doc(
    company_oid, user_oid,
    tx: Dict, tx_ref: Dict,
    doc: Dict, match_info: Dict,
    match_type: str,
) -> Dict:
    """Build a match document ready for DB insertion."""
    return {
        'company_id': company_oid,
        'user_id': user_oid,
        'transaction_ref': {
            'statement_id': tx_ref['statement_id'],
            'tx_index': tx_ref['tx_index'],
            'date': tx.get('date'),
            'description': tx.get('description'),
            'amount': float(tx.get('amount', 0)),
            'type': tx.get('type', 'debit'),
        },
        'document_ref': {
            'document_id': doc['_id'],
            'filename': get_doc_filename(doc),
            'amount': match_info.get('matched_doc_amount') or get_doc_amount(doc),
            'date': get_doc_date(doc),
            'vendor_name': get_doc_vendor(doc),
            'receiver_name': get_doc_receiver(doc),
        },
        'match_type': match_type,
        'score': {
            'total_score': match_info['score'],
            'data_quality': match_info['data_quality'],
            'breakdown': match_info['breakdown'],
        },
        'status': 'confirmed',
        'source': 'auto',
    }
