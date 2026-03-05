/**
 * Mock invoice data used during tutorial for new users.
 * Content changes based on language selection.
 */

import { DocumentItem } from '../../services/documentApi';

export const SAMPLE_ID = 'sample-001';

export function buildSampleDoc(lang: string = 'tr'): DocumentItem {
    if (lang === 'en') {
        return {
            id: SAMPLE_ID,
            filename: 'restaurant_invoice.pdf',
            type: 'invoice',
            ocr_status: 'completed',
            created_at: new Date().toISOString(),
            extracted_data: {
                supplier_name: 'The Capital Grille',
                supplier_tax_id: 'US-47291038',
                supplier_address: '132 E 57th St, New York, NY 10022',
                invoice_number: 'TCG-2026-009174',
                invoice_type: 'Restaurant',
                invoice_date: '2026-02-15',
                due_date: '2026-02-15',
                total_amount: 285.50,
                net_amount: 248.26,
                total_tax_amount: 37.24,
                currency: 'USD',
                expense_category: 'food',
                items: [
                    { description: 'Dry-Aged Ribeye Steak', quantity: 2, unit_price: 68.00, amount: 136.00 },
                    { description: 'Caesar Salad', quantity: 2, unit_price: 18.50, amount: 37.00 },
                    { description: 'Lobster Bisque', quantity: 1, unit_price: 22.00, amount: 22.00 },
                    { description: 'Tiramisu', quantity: 2, unit_price: 16.00, amount: 32.00 },
                    { description: 'Sparkling Water (750ml)', quantity: 2, unit_price: 10.63, amount: 21.26 },
                ],
            },
        } as unknown as DocumentItem;
    }

    return {
        id: SAMPLE_ID,
        filename: 'restoran_fatura.pdf',
        type: 'invoice',
        ocr_status: 'completed',
        created_at: new Date().toISOString(),
        extracted_data: {
            supplier_name: 'Nusret Steakhouse',
            supplier_tax_id: '8520147963',
            supplier_address: 'Etiler Mah. Nisbetiye Cad. No:87, Beşiktaş/İstanbul',
            invoice_number: 'NSR-2026-014823',
            invoice_type: 'Restoran',
            invoice_date: '2026-02-15',
            due_date: '2026-02-15',
            total_amount: 4850.00,
            net_amount: 4112.00,
            total_tax_amount: 738.00,
            currency: 'TRY',
            expense_category: 'food',
            items: [
                { description: 'Kuzu Pirzola', quantity: 2, unit_price: 950.00, amount: 1900.00 },
                { description: 'Lokum Burger', quantity: 1, unit_price: 620.00, amount: 620.00 },
                { description: 'Çoban Salata', quantity: 2, unit_price: 185.00, amount: 370.00 },
                { description: 'Künefe', quantity: 2, unit_price: 280.00, amount: 560.00 },
                { description: 'Türk Kahvesi', quantity: 3, unit_price: 220.67, amount: 662.00 },
            ],
        },
    } as unknown as DocumentItem;
}
