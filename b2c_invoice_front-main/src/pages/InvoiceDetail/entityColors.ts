/**
 * Entity color utilities for OCR bounding box highlights.
 *
 * Maps entity types to RGBA fill and RGB border colors.
 */

const ENTITY_COLORS: Record<string, string> = {
    'total_amount': 'rgba(34, 197, 94, 0.25)',
    'net_amount': 'rgba(34, 197, 94, 0.2)',
    'total_tax_amount': 'rgba(251, 191, 36, 0.25)',
    'supplier_name': 'rgba(59, 130, 246, 0.25)',
    'supplier_address': 'rgba(59, 130, 246, 0.15)',
    'supplier_email': 'rgba(59, 130, 246, 0.15)',
    'supplier_phone': 'rgba(59, 130, 246, 0.15)',
    'supplier_website': 'rgba(59, 130, 246, 0.15)',
    'supplier_tax_id': 'rgba(59, 130, 246, 0.2)',
    'supplier_iban': 'rgba(59, 130, 246, 0.2)',
    'receiver_name': 'rgba(14, 165, 233, 0.25)',
    'receiver_address': 'rgba(14, 165, 233, 0.15)',
    'invoice_id': 'rgba(139, 92, 246, 0.25)',
    'invoice_date': 'rgba(236, 72, 153, 0.25)',
    'due_date': 'rgba(236, 72, 153, 0.2)',
    'invoice_type': 'rgba(139, 92, 246, 0.2)',
    'currency': 'rgba(234, 179, 8, 0.2)',
    'line_item': 'rgba(99, 102, 241, 0.15)',
};

const BORDER_COLORS: Record<string, string> = {
    'total_amount': 'rgb(34, 197, 94)',
    'net_amount': 'rgb(34, 197, 94)',
    'total_tax_amount': 'rgb(251, 191, 36)',
    'supplier_name': 'rgb(59, 130, 246)',
    'supplier_address': 'rgb(59, 130, 246)',
    'supplier_email': 'rgb(59, 130, 246)',
    'supplier_phone': 'rgb(59, 130, 246)',
    'supplier_website': 'rgb(59, 130, 246)',
    'supplier_tax_id': 'rgb(59, 130, 246)',
    'supplier_iban': 'rgb(59, 130, 246)',
    'receiver_name': 'rgb(14, 165, 233)',
    'receiver_address': 'rgb(14, 165, 233)',
    'invoice_id': 'rgb(139, 92, 246)',
    'invoice_date': 'rgb(236, 72, 153)',
    'due_date': 'rgb(236, 72, 153)',
    'invoice_type': 'rgb(139, 92, 246)',
    'currency': 'rgb(234, 179, 8)',
    'line_item': 'rgb(99, 102, 241)',
};

export function getEntityColor(type: string): string {
    return ENTITY_COLORS[type] || 'rgba(156, 163, 175, 0.2)';
}

export function getBorderColor(type: string): string {
    return BORDER_COLORS[type] || 'rgb(156, 163, 175)';
}
