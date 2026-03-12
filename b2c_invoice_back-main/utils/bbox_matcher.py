"""
Bbox Matcher - Maps extracted entity values to OCR bounding boxes.

Populates `entities_with_bounds` by matching LLM-extracted values
against OCR line/block/token positions using a 7-strategy approach.
"""

import re
import logging
from typing import Optional, Tuple, Dict, List, Any

logger = logging.getLogger(__name__)


def add_bounding_boxes(
    extracted_data: Dict[str, Any],
    ocr_text: str,
    ocr_index: Dict[str, List[Dict]]
) -> None:
    """
    Populate entities_with_bounds in extracted_data by matching values to OCR bboxes.

    Modifies extracted_data in-place.
    """
    if not ocr_index or not ocr_text:
        return

    entity_fields = [
        ('invoice_id', 'invoice_number'),
        ('invoice_date', 'invoice_date'),
        ('invoice_type', 'invoice_type'),
        ('due_date', 'due_date'),
        ('supplier_name', 'supplier_name'),
        ('supplier_address', 'supplier_address'),
        ('supplier_email', 'supplier_email'),
        ('supplier_phone', 'supplier_phone'),
        ('supplier_website', 'supplier_website'),
        ('supplier_tax_id', 'supplier_tax_id'),
        ('supplier_iban', 'supplier_iban'),
        ('receiver_name', 'receiver_name'),
        ('receiver_address', 'receiver_address'),
        ('total_amount', 'total_amount'),
        ('net_amount', 'net_amount'),
        ('total_tax_amount', 'total_tax_amount'),
        ('currency', 'currency'),
    ]

    bounds = extracted_data.setdefault('entities_with_bounds', [])

    # Match main entity fields
    for entity_type, field_name in entity_fields:
        value = extracted_data.get(field_name)
        if not value:
            continue
        value_str = str(value)
        bbox, page = _find_value_bbox(value_str, ocr_text, ocr_index)
        bounds.append({
            'type': entity_type,
            'value': value_str,
            'confidence': 0.95 if bbox else 0.8,
            'bounding_box': bbox,
            'page': page if page is not None else 0,
            'source': 'ocr_llm'
        })

    # Match IBANs
    for iban_data in extracted_data.get('all_ibans', []):
        bbox, page = _find_value_bbox(iban_data['value'], ocr_text, ocr_index)
        iban_data['bounding_box'] = bbox
        iban_data['page'] = page if page is not None else 0
        bounds.append({
            'type': 'supplier_iban',
            'value': iban_data['value'],
            'confidence': 0.95 if bbox else 0.8,
            'bounding_box': bbox,
            'page': page if page is not None else 0,
            'source': 'ocr_llm'
        })

    # Match line item descriptions
    for item in extracted_data.get('items', []):
        if item.get('description'):
            bbox, page = _find_value_bbox(
                item['description'], ocr_text, ocr_index
            )
            bounds.append({
                'type': 'line_item',
                'value': item['description'],
                'confidence': 0.9 if bbox else 0.7,
                'bounding_box': bbox,
                'page': page if page is not None else 0,
                'source': 'ocr_llm'
            })


def add_bank_statement_bounding_boxes(
    extracted_data: Dict[str, Any],
    ocr_text: str,
    ocr_index: Dict[str, List[Dict]],
) -> None:
    """Populate entities_with_bounds for bank statement extracted data.

    - Header fields: matched via OCR text lookup (reuses _find_value_bbox)
    - Transaction rows: use pre-computed page/y_min/y_max from line_pos
    """
    if not ocr_index or not ocr_text:
        return

    bounds = extracted_data.setdefault('entities_with_bounds', [])

    # 1. Header fields
    header_fields = [
        ('bank_name', 'bank_name'),
        ('account_holder', 'account_holder'),
        ('account_number', 'account_number'),
        ('card_number', 'card_number'),
        ('statement_date', 'statement_date'),
        ('opening_balance', 'opening_balance'),
        ('closing_balance', 'closing_balance'),
    ]
    for entity_type, field_name in header_fields:
        value = extracted_data.get(field_name)
        if not value:
            continue
        value_str = str(value)
        bbox, page = _find_value_bbox(value_str, ocr_text, ocr_index)
        bounds.append({
            'type': entity_type,
            'value': value_str,
            'confidence': 0.95 if bbox else 0.8,
            'bounding_box': bbox,
            'page': page if page is not None else 0,
            'source': 'ocr_llm',
        })

    # 2. Transaction rows — full-width bounding boxes from line_pos data
    for i, tx in enumerate(extracted_data.get('transactions') or []):
        if tx.get('page') is None or tx.get('y_min') is None:
            continue
        page_num = tx['page']
        y_min = tx['y_min']
        y_max = tx['y_max']
        bounds.append({
            'type': 'transaction_row',
            'value': tx.get('description', f'Transaction {i + 1}'),
            'confidence': 0.9,
            'bounding_box': [
                {'x': 0.02, 'y': y_min},
                {'x': 0.98, 'y': y_min},
                {'x': 0.98, 'y': y_max},
                {'x': 0.02, 'y': y_max},
            ],
            'page': page_num,
            'source': 'line_pos',
        })


def _find_value_bbox(
    value: str,
    ocr_text: str,
    index: Dict[str, List[Dict]]
) -> Tuple[Optional[List[Dict[str, float]]], Optional[int]]:
    """
    Find bounding box and page for a value using OCR lines/blocks.

    Uses 7-strategy hierarchical matching:
    1. Exact line match
    2. IBAN without spaces (line + block)
    3. Substring containment
    4. Position-based lookup in full OCR text
    5. IBAN without spaces in full OCR text
    6. Word overlap (70% threshold)
    7. Exact token match for short values

    Returns (bbox, page) where page is 0-indexed.
    """
    if not value or not index:
        return None, None

    value_normalized = value.strip().lower()
    value_clean = ' '.join(value_normalized.split())
    is_iban = _is_iban_value(value)
    value_no_space = value_clean.replace(' ', '')

    # Strategy 1: Exact line match
    for line in index.get('lines', []):
        line_clean = ' '.join(line['text'].strip().lower().split())
        if value_clean == line_clean:
            return line['bbox'], line.get('page', 0)

    # Strategy 2: IBAN without spaces
    if is_iban:
        match = _find_iban_in_elements(value_no_space, index)
        if match:
            return match

    # Strategy 3: Substring containment
    for line in index.get('lines', []):
        line_clean = ' '.join(line['text'].strip().lower().split())
        if value_clean in line_clean:
            return line['bbox'], line.get('page', 0)
        if len(line_clean) > 10 and line_clean in value_clean:
            return line['bbox'], line.get('page', 0)

    # Strategy 4: Position-based lookup in OCR text
    start_idx = ocr_text.lower().find(value_clean)
    if start_idx != -1:
        for line in index.get('lines', []):
            if line['start'] <= start_idx < line['end']:
                return line['bbox'], line.get('page', 0)

    # Strategy 5: IBAN without spaces in full OCR text
    if is_iban:
        match = _find_iban_in_ocr_text(value_no_space, ocr_text, index)
        if match:
            return match

    # Strategy 6: Word overlap for medium-length values
    if not is_iban and len(value_clean) >= 5:
        match = _find_by_word_overlap(value_clean, index)
        if match:
            return match

    # Strategy 7: Exact token match for short values
    if len(value_clean) < 15 and not is_iban:
        for token in index.get('tokens', []):
            if value_clean == token['text'].strip().lower():
                return token['bbox'], token.get('page', 0)

    return None, None


def _is_iban_value(value: str) -> bool:
    """Check if value looks like an IBAN."""
    if not value:
        return False
    clean = value.replace(' ', '').upper()
    if 15 <= len(clean) <= 34:
        if clean[:2].isalpha() and clean[2:4].isdigit():
            return True
    return False


def _find_iban_in_elements(
    value_no_space: str,
    index: Dict[str, List[Dict]]
) -> Optional[Tuple[List, int]]:
    """Find IBAN by space-stripped matching in lines and blocks."""
    for line in index.get('lines', []):
        line_no_space = line['text'].strip().lower().replace(' ', '')
        if value_no_space in line_no_space:
            return line['bbox'], line.get('page', 0)
    for block in index.get('blocks', []):
        block_no_space = block['text'].strip().lower().replace(' ', '')
        if value_no_space in block_no_space:
            return block['bbox'], block.get('page', 0)
    return None


def _find_iban_in_ocr_text(
    value_no_space: str,
    ocr_text: str,
    index: Dict[str, List[Dict]]
) -> Optional[Tuple[List, int]]:
    """Find IBAN in full OCR text with space-stripped matching."""
    ocr_no_space = ocr_text.lower().replace(' ', '')
    start_idx = ocr_no_space.find(value_no_space)
    if start_idx == -1:
        return None

    # Map back to original position
    original_pos = 0
    no_space_pos = 0
    for i, char in enumerate(ocr_text.lower()):
        if no_space_pos >= start_idx:
            original_pos = i
            break
        if char != ' ':
            no_space_pos += 1

    for line in index.get('lines', []):
        if line['start'] <= original_pos < line['end']:
            return line['bbox'], line.get('page', 0)
    return None


def _find_by_word_overlap(
    value_clean: str,
    index: Dict[str, List[Dict]]
) -> Optional[Tuple[List, int]]:
    """Find best line match by significant word overlap (>=70%)."""
    value_words = set(value_clean.split())
    significant_words = {w for w in value_words if len(w) > 2}
    if not significant_words:
        return None

    best_match = None
    best_page = 0
    best_score = 0.0

    for line in index.get('lines', []):
        line_words = set(line['text'].strip().lower().split())
        sig_line = {w for w in line_words if len(w) > 2}
        if not sig_line:
            continue
        overlap = len(significant_words & sig_line)
        score = overlap / len(significant_words)
        if score > best_score and score >= 0.7:
            best_score = score
            best_match = line['bbox']
            best_page = line.get('page', 0)

    if best_match:
        return best_match, best_page
    return None
