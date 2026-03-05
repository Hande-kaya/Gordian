"""
Reconciliation Matcher — Hungarian (scipy) + greedy fallback.

Memory-bounded design:
- Hungarian: only for small matrices (≤200×200 = 320KB max)
- Greedy: matrix-free — streams scores, keeps only above-threshold candidates
- Hard limits: MAX_TRANSACTIONS / MAX_DOCUMENTS prevent unbounded growth

10 concurrent users × 2000tx × 5000doc: ~0 matrix RAM (greedy, no matrix).
Candidates list: typically <5% of NxM → ~20K tuples → ~500KB per user.
"""

import logging
from typing import Dict, List, Optional, Tuple

from services.reconciliation_scoring import (
    calculate_pair_score,
    MATCH_MIN,
)

logger = logging.getLogger(__name__)

# Hungarian: optimal but O(N³) time + O(N²) memory. Only for small sets.
_HUNGARIAN_LIMIT = 200

# Hard limits — reject if exceeded (prevents RAM explosion)
MAX_TRANSACTIONS = 3000
MAX_DOCUMENTS = 5000


def _calc_score_args(tx: Dict, doc: Dict, weights: Optional[Dict[str, float]]):
    """Build kwargs for calculate_pair_score from tx/doc dicts."""
    return dict(
        tx_amount=abs(float(tx.get('amount', 0))),
        tx_date=tx.get('date'),
        tx_desc=tx.get('description'),
        doc_amounts=doc.get('amounts') or abs(float(doc.get('amount', 0))),
        doc_date=doc.get('date'),
        doc_vendor=doc.get('vendor_name'),
        doc_filename=doc.get('filename'),
        weights=weights,
    )


def _build_float_matrix(
    transactions: List[Dict],
    documents: List[Dict],
    weights: Optional[Dict[str, float]] = None,
) -> List[List[float]]:
    """Build NxM float matrix. Only used for small (Hungarian) datasets."""
    matrix: List[List[float]] = []
    for tx in transactions:
        row: List[float] = []
        for doc in documents:
            score = calculate_pair_score(**_calc_score_args(tx, doc, weights))
            row.append(score['total_score'])
        matrix.append(row)
    return matrix


def _hungarian_assign(
    matrix: List[List[float]], n_tx: int, n_doc: int,
) -> List[Tuple[int, int, float]]:
    """Optimal assignment via scipy linear_sum_assignment."""
    try:
        from scipy.optimize import linear_sum_assignment
    except ImportError:
        logger.debug("scipy not available, using greedy matcher")
        return _greedy_assign_from_matrix(matrix, n_tx, n_doc)

    import numpy as np

    size = max(n_tx, n_doc)
    cost = np.zeros((size, size))
    for i in range(n_tx):
        for j in range(n_doc):
            cost[i][j] = 1.0 - matrix[i][j]

    row_ind, col_ind = linear_sum_assignment(cost)

    pairs = []
    for r, c in zip(row_ind, col_ind):
        if r < n_tx and c < n_doc:
            pairs.append((r, c, matrix[r][c]))
    return pairs


def _greedy_assign_from_matrix(
    matrix: List[List[float]], n_tx: int, n_doc: int,
) -> List[Tuple[int, int, float]]:
    """Greedy from pre-built matrix (scipy fallback for small sets)."""
    candidates = []
    for i in range(n_tx):
        for j in range(n_doc):
            s = matrix[i][j]
            if s >= MATCH_MIN:
                candidates.append((i, j, s))
    return _greedy_pick(candidates)


def _greedy_streaming(
    transactions: List[Dict],
    documents: List[Dict],
    weights: Optional[Dict[str, float]],
    threshold: float,
) -> List[Tuple[int, int, float]]:
    """
    Matrix-free greedy: stream scores, collect only above-threshold.

    Memory: O(C) where C = above-threshold candidates, NOT O(N×M).
    Typical C < 5% of NxM (most pairs score far below 0.90).
    """
    candidates: List[Tuple[int, int, float]] = []
    for i, tx in enumerate(transactions):
        for j, doc in enumerate(documents):
            score = calculate_pair_score(**_calc_score_args(tx, doc, weights))
            s = score['total_score']
            if s >= threshold:
                candidates.append((i, j, s))
    return _greedy_pick(candidates)


def _greedy_pick(
    candidates: List[Tuple[int, int, float]],
) -> List[Tuple[int, int, float]]:
    """From sorted candidates, pick first non-conflicting (1:1)."""
    candidates.sort(key=lambda x: x[2], reverse=True)
    used_tx: set = set()
    used_doc: set = set()
    pairs: List[Tuple[int, int, float]] = []
    for tx_i, doc_j, score in candidates:
        if tx_i not in used_tx and doc_j not in used_doc:
            pairs.append((tx_i, doc_j, score))
            used_tx.add(tx_i)
            used_doc.add(doc_j)
    return pairs


def find_optimal_matches(
    transactions: List[Dict],
    documents: List[Dict],
    weights: Optional[Dict[str, float]] = None,
    threshold: float = MATCH_MIN,
) -> Dict:
    """
    Main entry point.

    Returns:
        {
            'matches': [{'tx_index', 'doc_index', 'score', ...}],
            'unmatched_tx': [int],
            'unmatched_doc': [int],
            'error': str (optional, if limits exceeded),
        }
    """
    n_tx = len(transactions)
    n_doc = len(documents)

    if not n_tx or not n_doc:
        return {
            'matches': [],
            'unmatched_tx': list(range(n_tx)),
            'unmatched_doc': list(range(n_doc)),
        }

    # Hard limits — refuse instead of OOM
    if n_tx > MAX_TRANSACTIONS or n_doc > MAX_DOCUMENTS:
        logger.error(
            "Matching refused: %d tx × %d docs exceeds limits (%d×%d)",
            n_tx, n_doc, MAX_TRANSACTIONS, MAX_DOCUMENTS,
        )
        return {
            'matches': [],
            'unmatched_tx': list(range(n_tx)),
            'unmatched_doc': list(range(n_doc)),
            'error': f'Too many items ({n_tx} tx × {n_doc} docs). '
                     f'Max {MAX_TRANSACTIONS} transactions, {MAX_DOCUMENTS} documents.',
        }

    # Small: build matrix + Hungarian (optimal, bounded memory)
    if n_tx <= _HUNGARIAN_LIMIT and n_doc <= _HUNGARIAN_LIMIT:
        matrix = _build_float_matrix(transactions, documents, weights)
        raw_pairs = _hungarian_assign(matrix, n_tx, n_doc)
    else:
        # Large: matrix-free streaming greedy (O(C) memory, not O(N×M))
        logger.info(
            "Matching %d tx × %d docs via streaming greedy", n_tx, n_doc,
        )
        raw_pairs = _greedy_streaming(
            transactions, documents, weights, threshold,
        )

    # Compute full detail only for matched pairs
    matched_tx: set = set()
    matched_doc: set = set()
    matches: list = []

    for tx_i, doc_j, score in raw_pairs:
        if score >= threshold:
            detail = calculate_pair_score(
                **_calc_score_args(transactions[tx_i], documents[doc_j], weights)
            )
            matches.append({
                'tx_index': tx_i,
                'doc_index': doc_j,
                'score': detail['total_score'],
                'data_quality': detail['data_quality'],
                'breakdown': detail['breakdown'],
            })
            matched_tx.add(tx_i)
            matched_doc.add(doc_j)

    unmatched_tx = [i for i in range(n_tx) if i not in matched_tx]
    unmatched_doc = [j for j in range(n_doc) if j not in matched_doc]

    return {
        'matches': matches,
        'unmatched_tx': unmatched_tx,
        'unmatched_doc': unmatched_doc,
    }
