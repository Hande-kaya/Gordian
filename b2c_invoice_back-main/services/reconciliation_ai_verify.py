"""
Reconciliation AI Verification — GPT-4o-mini final touch for uncertain matches.

Called after deterministic scoring for matches below HIGH_CONFIDENCE (0.75).
AI reviews the pair and returns a revised score + brief reason.
Does NOT trust AI blindly — clamps to ±0.15 of rule-based score.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_AI_MODEL = 'gpt-4o-mini'
_AI_TEMPERATURE = 0.1
_AI_MAX_TOKENS = 300
_HIGH_CONFIDENCE = 0.75
_MAX_AI_DELTA = 0.15  # AI can adjust score by at most ±15%


def _get_openai_client():
    """Lazy import — only when AI verification is actually called."""
    try:
        from openai import OpenAI
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            logger.info("OPENAI_API_KEY not set, skipping AI verification")
            return None
        return OpenAI(api_key=api_key)
    except Exception as e:
        logger.warning(f"OpenAI client unavailable: {e}")
        return None


_LANG_NAMES = {
    'tr': 'Turkish',
    'en': 'English',
    'de': 'German',
}

_SYSTEM_PROMPT = (
    "You are a financial reconciliation auditor. "
    "You verify whether a bank transaction matches a document (invoice/receipt). "
    "Respond ONLY with valid JSON, no markdown."
)

_VERIFY_PROMPT_TEMPLATE = """Verify if this bank transaction matches this document.

BANK TRANSACTION:
- Date: {tx_date}
- Description: {tx_desc}
- Amount: {tx_amount}
- Type: {tx_type}

DOCUMENT:
- Filename: {doc_filename}
- Vendor/Supplier: {doc_vendor}
- Receiver/Buyer: {doc_receiver}
- Amount: {doc_amount}
- Date: {doc_date}
- Match type: {match_type}

RULE-BASED SCORE: {rule_score} (breakdown: amount={bd_amount}, date={bd_date}, description={bd_desc})

Respond with JSON:
{{
  "ai_score": 0.0-1.0,
  "confidence": "high" | "medium" | "low",
  "reason": "Brief explanation in {lang_name} (max 50 words)"
}}

Rules:
- Focus on: amount match, date proximity, name/description match
- For expenses: transaction description should relate to vendor/supplier
- For income: transaction description should relate to buyer/receiver
- If amounts match exactly → strong signal
- If names are clearly the same entity (even with OCR typos) → boost score
- If nothing connects them → lower score"""


def verify_matches(
    matches: List[Dict[str, Any]],
    language: str = 'en',
) -> List[Dict[str, Any]]:
    """
    AI-verify ALL matches and add ai_reason notes. Modifies dicts in-place.

    Each match dict must have:
      - transaction_ref: {date, description, amount, type}
      - document_ref: {filename, vendor_name, receiver_name, amount, date}
      - match_type: 'expense' | 'income'
      - score: {total_score, breakdown: {amount, date, description}}

    Adds to each match:
      - score.ai_score: float (AI's assessment)
      - score.ai_reason: str (brief explanation in user's language)
      - score.final_score: float (clamped blend for uncertain, same for high)
    """
    if not matches:
        return matches

    client = _get_openai_client()
    if client is None:
        for m in matches:
            m['score']['final_score'] = m['score']['total_score']
        return matches

    lang_name = _LANG_NAMES.get(language, 'English')

    for m in matches:
        ai_result = _verify_single(client, m, lang_name)
        if ai_result:
            rule_score = m['score']['total_score']
            ai_score = ai_result['ai_score']

            # High-confidence: keep rule score, only add note
            if rule_score >= _HIGH_CONFIDENCE:
                m['score']['final_score'] = rule_score
            else:
                # Clamp: AI can only adjust ±MAX_AI_DELTA from rule-based
                clamped = max(
                    rule_score - _MAX_AI_DELTA,
                    min(rule_score + _MAX_AI_DELTA, ai_score),
                )
                m['score']['final_score'] = round(clamped, 4)

            m['score']['ai_score'] = round(ai_score, 4)
            m['score']['ai_reason'] = ai_result.get('reason', '')
        else:
            m['score']['final_score'] = m['score']['total_score']

    return matches


def _verify_single(client, match: Dict, lang_name: str = 'English') -> Optional[Dict]:
    """Call GPT-4o-mini for a single match verification."""
    tx = match['transaction_ref']
    doc = match['document_ref']
    bd = match['score']['breakdown']

    prompt = _VERIFY_PROMPT_TEMPLATE.format(
        tx_date=tx.get('date') or 'N/A',
        tx_desc=tx.get('description') or 'N/A',
        tx_amount=tx.get('amount', 0),
        tx_type=tx.get('type', 'debit'),
        doc_filename=doc.get('filename') or 'N/A',
        doc_vendor=doc.get('vendor_name') or 'N/A',
        doc_receiver=doc.get('receiver_name') or 'N/A',
        doc_amount=doc.get('amount', 0),
        doc_date=doc.get('date') or 'N/A',
        match_type=match.get('match_type', 'expense'),
        rule_score=round(match['score']['total_score'], 3),
        bd_amount=round(bd.get('amount', 0), 3),
        bd_date=round(bd.get('date', -1), 3),
        bd_desc=round(bd.get('description', -1), 3),
        lang_name=lang_name,
    )

    try:
        response = client.chat.completions.create(
            model=_AI_MODEL,
            temperature=_AI_TEMPERATURE,
            max_tokens=_AI_MAX_TOKENS,
            messages=[
                {'role': 'system', 'content': _SYSTEM_PROMPT},
                {'role': 'user', 'content': prompt},
            ],
        )

        text = response.choices[0].message.content.strip()

        # Strip markdown fences if present
        if text.startswith('```'):
            text = text.split('\n', 1)[-1].rsplit('```', 1)[0].strip()

        result = json.loads(text)

        # Validate
        ai_score = float(result.get('ai_score', 0))
        if not 0.0 <= ai_score <= 1.0:
            ai_score = max(0.0, min(1.0, ai_score))

        return {
            'ai_score': ai_score,
            'confidence': result.get('confidence', 'medium'),
            'reason': str(result.get('reason', ''))[:200],
        }

    except Exception as e:
        logger.warning(f"AI verification failed for match: {e}")
        return None
