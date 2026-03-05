# Invoice Management Backend - Project Status

## Overview
Flask backend (Port 5004) for Invoice Management module. Shares MongoDB database with other modules.

## API Endpoints

### RFQ Integration (`/api/invoices/completed-rfqs`)
- `GET /completed-rfqs` - List completed RFQs with pagination
- `GET /completed-rfqs/{rfq_id}` - Get RFQ detail with offers and products
- `GET /completed-rfqs/{rfq_id}/{supplier_id}/attachments` - List supplier attachments

### Attachments (`/api/invoices/attachments`)
- `GET /attachments/{rfq_id}/{attachment_id}/download` - Download attachment file

### Invoices (`/api/invoices`)
- `GET /` - List invoices with pagination and filters
- `GET /{invoice_id}` - Get invoice detail
- `POST /{rfq_id}/upload` - Upload invoice for RFQ
- `DELETE /invoice/{invoice_id}` - Delete invoice

### RFQ Invoices
- `GET /rfq/{rfq_id}/invoices` - Get all invoices for an RFQ

## Architecture

```
routes/invoices/
  ├── __init__.py      # Namespace definition
  ├── main.py          # CRUD endpoints
  ├── upload.py        # File upload
  ├── rfq_integration.py # RFQ list and detail
  ├── attachments.py   # Attachment download
  └── matching.py      # Invoice matching logic

services/
  ├── rfq_service.py     # RFQ business logic
  └── invoice_service.py # Invoice business logic

repositories/
  ├── rfq_repository.py     # RFQ database operations
  └── invoice_repository.py # Invoice database operations
```

## Database Collections
- `rfqs` - RFQ data (read from main backend)
- `invoices` - Invoice records
- `supplier_product_documents` - Attachment files

### B2C Auth (`/api/auth`)
- `POST /register` - Register new B2C user
- `POST /login` - Login with email/password
- `POST /verify-email` - Verify email with OTP
- `POST /resend-verification` - Resend verification code
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password with code
- `PATCH /profile` - Update user profile (name, email) — returns new JWT
- `POST /change-password` - Change password (requires current password)
- `GET /me` - Get current user info
- `POST /logout` - Server-side logout (blacklists JWT token)

### Microsoft SSO (`/api/auth/microsoft`)
- `GET /login` - Initiate Microsoft OAuth flow (returns authorization_url)
- `GET /callback` - Handle Microsoft redirect (redirects to frontend)
- `POST /complete-registration` - Complete registration for new SSO users

### Google SSO (`/api/auth/google`)
- `GET /login` - Initiate Google OAuth flow (returns authorization_url)
- `GET /callback` - Handle Google redirect (redirects to frontend)
- `POST /complete-registration` - Complete registration for new Google SSO users

### Reconciliation (`/api/reconciliation`)
- `POST /match` - Run matching engine (debit→expenses, credit→incomes). Preserves manual/confirmed matches.
- `GET /matches` - List saved matches (paginated, filterable by status/match_type)
- `DELETE /matches/{id}` - Delete a single match
- `PATCH /matches/{id}` - Update match status (confirmed/rejected)
- `GET /transactions` - Unified transaction list (matched+unmatched) with pagination and filter
- `POST /matches/manual` - Create manual match between transaction and document

### Documents (`/api/documents`)
- `POST /upload` - Upload document for OCR processing
- `GET /` - List documents with pagination and filters
- `GET /trash` - List soft-deleted documents (30-day window)
- `PATCH /{id}/fields` - Update extracted data fields
- `GET /{id}/download` - Download document file from GridFS
- `POST /{id}/restore` - Restore soft-deleted document
- `DELETE /{id}` - Soft-delete document (sets deleted_at timestamp)

### Exchange Rates (`/api/exchange-rates`)
- `POST /sync` - Seed historical rates from 2020 to today (Frankfurter API, one-time)
- `GET /latest` - Show latest exchange rates from DB
- `POST /update` - Trigger daily rate update

## Known Issues
- `services/document_service.py` at 860 lines (pre-existing tech debt, exceeds 500 limit)
- `services/bank_statement_extractor.py` at 509 lines (slightly over 500 limit)

### 1 Mar 2026 - Cross-Domain Auth Fix (Production)
- **Problem**: Backend on `onrender.com`, frontend on `pages.dev` — different domains. Cookies with `SameSite=Lax` not sent with cross-site XHR/fetch requests. ALL authentication (login, SSO, session check) broken on production.
- **Solution**: Hybrid approach — cookie + Authorization header:
  1. `cookie_helper.py`: Changed `SameSite=Lax` → `SameSite=None; Secure=True` (allows cross-domain cookies where browser supports it)
  2. Backend returns `access_token` in response body for login, verify-email, SSO complete-registration, profile update
  3. SSO redirect includes `token` param in URL (cookie alone unreliable cross-domain)
  4. Frontend stores token in `localStorage('access_token')`, sends via `Authorization: Bearer` header
  5. `getAuthHeaders()` helper in `api.ts` for direct fetch calls (PDF viewer, upload, etc.)
  6. `token_required` decorator already supports both cookie and Authorization header (no change needed)
- **Files changed**: `cookie_helper.py`, `auth.py`, `sso_helpers.py`, `auth_account.py`, `authApi.ts`, `api.ts`, `SsoCallbackPage.tsx`, `AuthContext.tsx`, `PdfViewerPanel.tsx`, `BulkUploadModal.tsx`, `DocPreview.tsx`

## Architectural Decisions

### 2 Feb 2026 - Shared JWT Secret
- **Decision**: Use same JWT_SECRET_KEY as other modules
- **Reason**: Single sign-on across Portal, RFQ Management, Invoice Checker, Invoice Management
- **Impact**: Token validation works without separate auth service call

### 2 Feb 2026 - SSL Handling
- **Issue**: MongoDB Atlas requires SSL, local MongoDB doesn't
- **Fix**: Detect 'localhost' in URI and skip SSL for local connections
- **File**: database.py

### 18 Feb 2026 - Microsoft & Google SSO for B2C
- **Feature**: Added Microsoft + Google SSO login/register for B2C users
- **Pattern**: Shared helpers in `sso_helpers.py`, provider-specific files for auth flow
- **Flow**: Login → OAuth → Callback → existing user: auto-login / new user: completion form
- **Files**: `routes/sso_helpers.py` (shared), `routes/auth_microsoft.py`, `routes/auth_google.py`, `config.py`
- **Reuses**: `_create_virtual_company`, `_get_next_user_id`, `_build_token_payload` from auth.py
- **Edge cases**: B2B accounts rejected, unverified accounts auto-verified, completion token has 10min TTL

#### PROD/DEV DEPLOYMENT CHECKLIST (SSO)
Prod veya dev ortamına geçerken aşağıdaki URI'ler güncellenmelidir:
1. **Microsoft (Azure AD)**:
   - `.env`: `AZURE_AD_REDIRECT_URI` → prod backend URL'i (örn: `https://api.example.com/api/auth/microsoft/callback`)
   - Azure Portal → App registrations → Redirect URIs'ye prod URL'i ekle
2. **Google OAuth2**:
   - `.env`: `GOOGLE_REDIRECT_URI` → prod backend URL'i (örn: `https://api.example.com/api/auth/google/callback`)
   - GCP Console → Credentials → OAuth client → Authorized redirect URIs'ye prod URL'i ekle
   - GCP Console → OAuth consent screen → "Testing" → "In Production" moduna geçir (yoksa sadece test user'lar giriş yapabilir)
3. **Frontend**:
   - `.env`: `B2C_FRONTEND_URL` → prod frontend URL'i (callback redirect için)
4. **Tüm `.env` değişkenleri** prod ortam değişkenlerine taşınmalı (hard-coded olmamalı)

### 10 Feb 2026 - Editable Document Fields (PATCH Endpoint)
- **Feature**: Added `PATCH /api/documents/{id}/fields` endpoint for inline editing of extracted data
- **Whitelist**: vendor_name, supplier_tax_id, supplier_address, invoice_number, invoice_date, due_date, total_amount, currency, total_tax_amount, net_amount, expense_category
- **Dual Storage**: Updates both flat and nested extracted_data formats simultaneously
- **Triple Storage**: Also updates `entities_with_bounds[]` array entries via MongoDB arrayFilters
- **Files**: document_service.py (update_document_fields), routes/documents.py (DocumentFieldsUpdate)

### 18 Feb 2026 - Multi-Document Splitting
- **Feature**: Detect and split PDFs containing multiple invoices/receipts
- **Architecture**: OCR (document_ai_service.py) and LLM extraction (llm_extraction_service.py) separated
- **Layout Module**: Copied from invoice-checker (services/layout/), handles side-by-side, stacked, and multi-page detection
- **Multi-doc flow**: OCR → build index → layout analysis → per-boundary LLM extraction → child doc creation
- **Parent/Child**: ALL extracted invoices become children. Parent is container only (hidden from list via `multi_document.is_parent != True`)
- **Children share** parent's GridFS file_ref and inherit company_id, user_id, type
- **Files**: document_ai_service.py (OCR+index), llm_extraction_service.py (LLM+multi-doc), document_service.py (split handling)

### 18 Feb 2026 - DELETE Endpoint
- **Feature**: `DELETE /api/documents/{id}` with cascade delete
- **Cascade**: Parent delete → children deleted + GridFS cleanup. Child delete → removed from parent's child_document_ids
- **GridFS**: Only deleted when no other documents reference the same file_ref
- **Files**: routes/documents.py (DocumentDetail.delete), document_service.py (delete_document)

### 19 Feb 2026 - Download Endpoint + Bbox Matching
- **Feature**: `GET /api/documents/{id}/download` serves PDF/image from GridFS
- **Auth**: @token_required + company ownership check. Supports ?token= query param for PDF viewer
- **Child docs**: Falls back to parent's file_ref if child has none
- **Bbox Matcher**: New `utils/bbox_matcher.py` populates `entities_with_bounds` during LLM extraction
- **7-strategy matching**: exact line, IBAN, substring, position, IBAN-no-space, word overlap (70%), token
- **Integration**: Called from `llm_extraction_service.py:extract_from_ocr()` after entity extraction
- **Files**: utils/bbox_matcher.py (new), routes/documents.py (DocumentDownload), document_service.py (get_document_file)
- **Note**: document_service.py now at 538 lines (slightly over 500 limit due to get_document_file addition)

### 19 Feb 2026 - Soft Delete & Trash
- **Feature**: Documents are soft-deleted (set `deleted_at` timestamp) instead of hard-deleted
- **Trash endpoint**: `GET /api/documents/trash` returns soft-deleted docs from last 30 days
- **Restore**: `POST /api/documents/{id}/restore` clears `deleted_at` field
- **Route ordering**: `/trash` and `/{id}/restore` routes placed BEFORE `/<string:document_id>` to avoid Flask-RESTX matching issues
- **Files**: routes/documents.py (DocumentTrash, DocumentRestore, reordered routes)

### 19 Feb 2026 - Google SSO Profile Photo
- **Feature**: Google profile photo captured during SSO login/registration
- **Existing users**: Profile photo set from Google if user doesn't already have one
- **New users**: Photo URL stored in completion token JWT, saved to `profile_photo` field on registration
- **Files**: auth_google.py (extract picture from userinfo), sso_helpers.py (thread picture_url through callback chain)

### 19 Feb 2026 - Profile Photo Upload
- **Feature**: `POST /api/auth/profile-photo` stores base64-encoded profile photo
- **Approach**: Client resizes to 200x200 JPEG, sends as base64 data URI (~20-40KB)
- **Storage**: Stored directly in user document's `profile_photo` field (no GridFS needed)
- **Files**: routes/auth.py (ProfilePhoto endpoint)

### 19 Feb 2026 - ThreadPoolExecutor for OCR (Performance & Safety)
- **Problem**: Each upload spawned unbounded `threading.Thread(daemon=True)`. 100 concurrent uploads = 100 threads + 100 GridFS reads + 100 GCP API calls.
- **Fix**: Replaced with `ThreadPoolExecutor(max_workers=5, thread_name_prefix='ocr')` + `atexit.register(shutdown)`
- **Impact**: Max 5 concurrent OCR tasks; overflow queued automatically. Thread names visible in logs as `ocr-0` through `ocr-4`.
- **Files**: services/document_service.py

### 19 Feb 2026 - WebSocket Removal
- **Decision**: Removed WebSocket (flask-socketio + eventlet) infrastructure
- **Reason**: Zero events emitted anywhere — pure dead code. eventlet monkey-patches stdlib, conflicts with ThreadPoolExecutor. Only real-time need (OCR progress) already handled by 3s frontend polling.
- **Removed**: `websocket/` directory, `flask-socketio`, `python-socketio`, `eventlet` from requirements.txt, socketio init/run from app.py
- **Alternative**: If real-time is needed later, SSE (Server-Sent Events) is lighter than WebSocket
- **Files**: app.py, requirements.txt, deleted websocket/__init__.py + websocket/socket_manager.py

### 19 Feb 2026 - Rate Limiting on Document Endpoints
- **Feature**: Added `@rate_limit` to upload (10/min) and reprocess (5/min) endpoints
- **Reason**: Prevents abuse of resource-intensive OCR pipeline
- **Files**: routes/documents.py

### 19 Feb 2026 - MongoDB Connection Pool Sizing
- **Change**: Added `maxPoolSize=20, minPoolSize=5` to MongoClient initialization
- **Reason**: Explicit pool sizing prevents connection exhaustion under load (5 OCR threads + request threads)
- **Files**: database.py

### 19 Feb 2026 - SERVICE.md Documentation
- **Feature**: Comprehensive service documentation covering architecture, auth, OCR pipeline, security, API endpoints, file upload specs, email system, database, and dependencies
- **File**: SERVICE.md

### 23 Feb 2026 - Per-User Customizable Expense Categories
- **Feature**: Replaced 9 hardcoded expense categories with 13 new business-standard categories. Categories are now per-user customizable via Settings UI.
- **Storage**: `companies` collection gets `expense_categories` array field (null = use defaults)
- **API**: `GET /api/categories`, `PUT /api/categories`, `POST /api/categories/reset`
- **Architecture**: 3-layer pattern — `models/expense_categories.py` (constants+validation), `repositories/company_repository.py` (DB ops), `services/category_service.py` (business logic), `routes/categories.py` (HTTP)
- **LLM Integration**: Invoice-checker OCR pipeline now fetches per-company categories dynamically and injects them into the GPT-4o-mini prompt. Categories include description hints for better classification.
- **Lazy Migration**: Old documents keep legacy keys (food, fuel, etc.). Frontend `getLabelByKey()` falls back to raw key for unknown categories. New docs get new categories from updated LLM prompt.
- **New Default Categories**: cogs, payroll, professional_fees, rent_facilities, office_expenses, technology, travel_meals, marketing, insurance, financial_costs, taxes_gov, assets_equipment, miscellaneous
- **Files**: `models/expense_categories.py` (new), `repositories/company_repository.py` (new), `services/category_service.py` (new), `routes/categories.py` (new), `app.py` (+2 lines)

### 22 Feb 2026 - Deploy-Ready Preparation
- **Feature**: Production deployment preparation for Render.com / Cloudflare Pages
- **Changes**:
  - Added `gunicorn>=21.2.0` to requirements.txt (WSGI server for production)
  - Created `Procfile` for Render.com (`gunicorn app:app --workers 4 --timeout 120`)
  - Added GCP_CREDENTIALS_BASE64 env var support in app.py (cloud platforms can't use file paths)
  - Created `.env.example` for both backend and frontend (all keys listed, no secrets)
  - Created frontend `.gitignore` (node_modules, build, .env excluded)
  - Created `public/_redirects` for Cloudflare Pages SPA routing
  - Fixed frontend PORT from 3005 to 3003 (matches backend CORS config)
- **Verification**: `npm run build` succeeds, `gunicorn app:app` starts and `/health` returns 200
- **TODO for deployment**: Update redirect URIs (Azure AD + Google OAuth), switch Google OAuth Testing→Production

### 24 Feb 2026 - Bank Statement Extraction (Hybrid Python + LLM)
- **Feature**: Upload bank statement PDFs → OCR → structured extraction of header fields + transactions
- **Problem**: Document AI OCR flattens multi-column tables into sequential text. GPT-4o-mini consistently confused Bonus loyalty points column with actual Tutar (amount) column in Garanti BBVA statements.
- **Solution**: Hybrid approach — Python parses transactions deterministically from OCR coordinates, LLM only extracts header/summary fields
- **Architecture**:
  - `bank_statement_extractor.py` (new, 477 lines): `BankStatementExtractor` class
  - `_reconstruct_table_text()`: Groups OCR lines by Y-proximity (ROW_TOL=0.008), sorts by X, outputs tab-separated text
  - `_parse_transactions()`: Python-based — "last amount on line = Tutar" rule, skip Bonus column
  - `_llm_extract_headers()`: GPT-4o-mini for bank_name, balances, totals only (max_tokens=500)
  - Credit detection: suffix=='+' OR 'ÖDEMENİZ İÇİN' OR 'TEŞEKKÜR' OR 'İADE' (NOT just 'ÖDEME')
- **Multi-format support**: Garanti BBVA (Turkish amounts "1.234,56", Turkish dates "05 Ocak 2026") + VakıfBank (English amounts "1,234.56", numeric dates "05.01.2026")
- **Results**: Garanti 74 transactions (was 27 with wrong amounts), VakıfBank 11 transactions with correct installment/payment handling
- **Integration**: `llm_extraction_service.py` delegates to `BankStatementExtractor` when `doc_type='bank-statement'`
- **Files**: `services/bank_statement_extractor.py` (new), `services/llm_extraction_service.py` (modified), `services/document_service.py` (modified), `routes/documents.py` (modified)

### 26 Feb 2026 - Multi-Link Reconciliation + Detail Modal Redesign + Document Picker UX
- **Feature**: A bank transaction can now be linked to multiple documents (multi-link). Detail modal redesigned with document cards list + preview. Document picker enhanced with confirmation, proximity scores, and date filtering.
- **Problem**: Unique index on `(company_id, statement_id, tx_index)` forced 1:1 tx-to-doc mapping. Users sometimes need to link one payment to multiple invoices. Document picker immediately closed after selection with no confirmation.
- **Solution**: Replaced unique index with non-unique compound + unique `(company_id, statement_id, tx_index, document_id)` to prevent duplicates only. DocumentPickerModal now stays open after linking with confirmation step.
- **DB Migration**: Dropped old unique index `company_id_1_transaction_ref.statement_id_1_transaction_ref.tx_index_1` manually.
- **Backend Changes**:
  - `database.py`: New compound indexes (non-unique for lookup, unique for dedup)
  - `reconciliation_repository.py`: `find_match_by_transaction()` → `find_matches_by_transaction()` (returns list), new `find_match_by_transaction_and_document()`
  - `reconciliation_service.py`: `get_all_transactions()` returns `matches[]` + backward-compat `match`. `create_manual_match()` checks doc-level duplicate only.
- **Frontend Changes**:
  - `reconciliationApi.ts`: `UnifiedTransaction.matches: ReconciliationMatch[]` added
  - `matchingPanelUtils.ts` (new): Extracted `fmtCurrency`, `getConfidenceLevel`, `getMatchScore`, `getMatches` helpers
  - `TransactionRow.tsx` (new): Extracted row with multi-link "+N" badge, per-row "+" link-more button
  - `MatchingPanel.tsx`: Refactored to use TransactionRow, `handleUnlinkFromDetail` refreshes detail modal state
  - `MatchDetailModal.tsx`: Redesigned — left panel: tx info + clickable document cards, right panel: selected doc preview, "Belge Ekle" button
  - `DocPreview.tsx`: HTTP 404 → friendly "Dosya bulunamadı" icon instead of red error
  - `DocumentPickerModal.tsx`: Confirmation step ("Bu belgeyi bağlamak istiyor musunuz?"), stays open after link, "Eklendi" badge on added docs, proximity score (0-100) per doc based on amount+date, hides docs >1 month from tx date
  - i18n: 9 new keys (linkedDocuments, fileNotFound, documentAlreadyLinked, linkMore, confirmLinkTitle, confirmLinkYes, confirmLinkCancel, docAdded, proximityScore) in TR/EN/DE
- **Auto-match**: Still selects 1 document per transaction. Users add extra docs manually.
- **Key Decision**: Modal approach (not page) for detail view — consistent with existing UX.
- **Proximity Score**: Amount score (0-60, exact match=60, >50% diff=0) + Date score (0-40, same day=40, >31 days=0). High ≥70, Medium ≥40, Low <40.

### 26 Feb 2026 - Manual Reconciliation (Link/Unlink/Manage)
- **Feature**: Users can now view all transactions (matched + unmatched), manually link/unlink documents, and confirm matches.
- **Problem**: Reconciliation page only showed auto-matched results. Unmatched transactions were invisible. No way to manually link or manage matches.
- **Solution**: 3 new backend endpoints + unified transaction API + DocumentPickerModal + MatchingPanel redesign.
- **Backend Changes**:
  - `reconciliation_repository.py`: 4 new methods (find_match_by_transaction, create_match, update_match_status, get_all_matches_for_company). Renamed delete_matches_by_company → delete_auto_matches_by_company.
  - `reconciliation_service.py`: 3 new methods (get_all_transactions, create_manual_match, update_match_status). run_matching now preserves manual/confirmed matches.
  - `reconciliation_helpers.py` (new): Extracted doc field helpers to keep service under 500 lines.
  - `routes/reconciliation.py`: 3 new endpoints (GET /transactions, POST /matches/manual, PATCH /matches/:id).
- **Frontend Changes**:
  - `reconciliationApi.ts`: UnifiedTransaction type, getTransactions, createManualMatch, updateMatchStatus functions.
  - `MatchingPanel.tsx`: Major rewrite — shows all tx with filter tabs (All/Matched/Unmatched), inline Link/Unlink/Confirm actions, pagination.
  - `DocumentPickerModal.tsx` (new): Modal for picking document to link. Sorts by amount proximity, filters by type.
  - SCSS split: `.upload-panel` styles extracted to `UploadPanel.scss` (Reconciliation.scss was 586 lines → now ~490).
  - `reconciliation.ts` i18n: 15 new keys (tr/en/de) for filters, actions, modal, status badges.
- **Key Decisions**: Re-match preserves manual/confirmed matches (only deletes auto). Locked tx/docs excluded from auto-matching.

### 25 Feb 2026 - Backend Reconciliation Matching Engine
- **Feature**: Moved matching engine from client-side (TS) to backend (Python). Scoring, Hungarian/greedy matching, results persisted in `reconciliation_matches` collection.
- **Problem**: Client-side matching doesn't scale (1000 tx × 2000 docs), results not persistent, no "Re-match" capability.
- **Solution**: 5 new backend files + 1 new frontend API service. Client-side `scoringEngine.ts` and `hungarianMatcher.ts` deleted.
- **Architecture**:
  - `reconciliation_scoring.py`: Pure scoring functions (amount tier, date diff, description fuzzy with TR/DE/FR/EU normalization)
  - `reconciliation_matcher.py`: Hungarian (scipy) + greedy fallback for >200×200 matrices
  - `reconciliation_repository.py`: CRUD for `reconciliation_matches` collection
  - `reconciliation_service.py`: Orchestrator — fetches transactions from bank statements, splits debit/credit, runs matching, bulk-saves results
  - `routes/reconciliation.py`: 3 endpoints (POST /match, GET /matches, DELETE /matches/:id)
- **Frontend**: "Eşleştir" button triggers backend matching. "Tekrar Eşleştir" deletes old results + re-runs. Results displayed from DB.
- **DB Schema**: `reconciliation_matches` with compound index on `(company_id, statement_id, tx_index)` unique + `(company_id, score.total_score)` for sorted queries
- **Dependency**: scipy installed for Hungarian algorithm (greedy fallback if unavailable)
- **AI Verification**: `reconciliation_ai_verify.py` — GPT-4o-mini reviews uncertain matches (<0.75 confidence). Clamped ±15% from rule-based score. Graceful fallback if OPENAI_API_KEY not set.
- **Counterparty Direction**: Expense matches use `vendor_name`, income matches use `receiver_name` (buyer). Falls back to whichever is available.
- **Multi-language**: Character normalization for TR (ğ,ş,ç,ı), DE (ä,ö,ü,ß), FR (é,è,ê,ô), EU. Date parsing supports TR/DE/EN month names + DD/MM/YYYY.
- **Files**: 6 new backend, `reconciliationApi.ts` (new), `MatchingPanel.tsx` (rewritten), `matchingUtils.ts` (slimmed to types only), `scoringEngine.ts` + `hungarianMatcher.ts` (deleted)

### 27 Feb 2026 - Security Hardening (Shannon Pentest Fixes)
- **Trigger**: Shannon AI pentester found 28 vulnerabilities (10 Critical, 15 High, 3 Medium)
- **Changes** (7 batches):
  1. **auth.py split** (564→402+218 lines): Protected endpoints moved to `routes/auth_account.py`. Security headers added to `app.py` (`@after_request`: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cache-Control). XSS fix in `utils/email.py` (markupsafe escape). SSO profile picture HTTPS-only validation. User enumeration fix (register returns generic message).
  2. **NoSQL injection**: New `utils/validators.py` with `safe_string_param()`. Applied to all query params in documents, reconciliation, stats, invoices routes. Defense-in-depth isinstance checks in repositories.
  3. **Rate limiting → MongoDB**: `utils/rate_limit.py` rewritten with atomic `findOneAndUpdate` (multi-worker safe). TTL index on `rate_limits` collection. Rate limits added to Microsoft/Google SSO endpoints (10/min) and resend-verification (3/min).
  4. **OTP strengthening**: 6→8 digits, `random.choices` → `secrets.randbelow` (CSPRNG). Frontend updated (VerifyEmailPage, ResetPasswordPage).
  5. **Authorization bypass**: Parent doc lookup in `document_service.py` now includes `company_id`. RFQ attachment download validates company access before serving files.
  6. **Token revocation**: JWT now includes `jti` (UUID) + `iat`. `utils/auth.py` checks `token_blacklist` collection. Query param token fallback removed. Logout endpoint in `auth_account.py` blacklists token. TTL index on `token_blacklist`. Frontend calls logout API before clearing session.
  7. **httpOnly cookie migration** (AUTH-VULN-01): JWT token moved from `localStorage` to httpOnly cookie. New `utils/cookie_helper.py` (47 lines). `utils/auth.py` reads cookie first, then Authorization header fallback. Login/verify/SSO/profile-update set cookie. Logout clears cookie. Frontend uses `credentials: 'include'` — no more `Authorization` header or `localStorage.auth_token`. PDF viewers use `withCredentials` instead of `?token=xxx` in URL. SSO redirect sets cookie (no token in URL).
- **Files changed**: 30+ files (22 backend, 8+ frontend). 3 new files (`auth_account.py`, `validators.py`, `cookie_helper.py`).
- **All files within 500-line limit** (auth.py: 401, auth_account.py: 222, documents.py: 481)

### 27 Feb 2026 - Stripe Payment + Usage/Credit System
- **Feature**: Credit pack purchase ($5 = 100 uploads + 20 regenerates) via Stripe Checkout + usage quota enforcement
- **Free Plan**: Monthly 50 uploads + 5 rematches (auto-resets lazily, no cron)
- **Credits**: Never expire, stack with multiple purchases. Consumption order: free quota first, then purchased credits.
- **Stripe Flow**: `POST /api/billing/checkout` → Stripe Checkout → `POST /api/billing/webhook` (signature-verified) → credits granted idempotently
- **Quota Enforcement**: Upload (402 if over), Reprocess (requires regenerate credits), Rematch (free quota then credits)
- **Backend Files**:
  - `config.py`: +6 lines (STRIPE_SECRET_KEY, PUBLISHABLE_KEY, WEBHOOK_SECRET, PRODUCT_ID, CREDIT_PACK_PRICE_ID)
  - `database.py`: +5 lines (user_usage + billing_transactions indexes)
  - `repositories/billing_repository.py` (new, 179 lines): user_usage + billing_transactions CRUD
  - `services/usage_service.py` (new, 185 lines): Quota check/consume logic, lazy monthly reset
  - `services/billing_service.py` (new, 143 lines): Stripe Checkout session + webhook handler
  - `routes/billing.py` (new, 127 lines): 4 endpoints (checkout, webhook, usage, history)
  - `routes/documents.py`: +12 lines (upload quota check + reprocess regenerate check)
  - `routes/reconciliation.py`: +8 lines (rematch quota check)
  - `app.py`: +2 lines (billing_ns registration)
- **Frontend Files**:
  - `services/billingApi.ts` (new, 57 lines): API client for billing endpoints
  - `pages/Settings/SubscriptionTab.tsx` (new, 64 lines): Free plan + credit pack purchase UI
  - `pages/Settings/UsageTab.tsx` (new, 110 lines): Real usage data with progress bars
  - `pages/Settings/tabIcons.tsx` (new, 23 lines): Extracted SVG icons
  - `pages/Settings/index.tsx`: Refactored to use sub-components, handles payment redirect params
  - `i18n/settings.ts`: 12 new keys per language (creditPackTitle, buyCredits, paymentSuccess, etc.)
  - `Settings.scss`: +4 lines (credit badge style)
- **Env vars needed**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CREDIT_PACK_PRICE_ID`
- **Stripe Product**: `prod_U34yIIN4BD7NIZ` (test mode)

### Billing API Endpoints (`/api/billing`)
- `POST /checkout` — @token_required — Create Stripe Checkout session
- `POST /webhook` — No auth (Stripe signature verified) — Handle payment events
- `GET /usage` — @token_required — Usage summary (free quota + credits)
- `GET /history` — @token_required — Billing transaction history (paginated)

### 02 Mar 2026 - Reconciliation Bug Fixes & Memory Optimization
- **BulkWriteError Handling**: `create_matches_bulk()` now uses `ordered=False` + catches `BulkWriteError` for partial insert (no more 500 on duplicate keys)
- **Matching Lock**: Company-level `matching_in_progress` flag in `companies` collection, atomic via `find_one_and_update`. Prevents concurrent matching. Released in `finally` block.
- **Matching Status Endpoint**: `GET /api/reconciliation/matching-status` — returns `{matching_in_progress: bool}`
- **Memory Optimization — DOC_PROJECTION**: Narrowed from full `extracted_data` (~200KB/doc) to only matching-needed sub-fields (~1KB/doc). 1000 docs: 200MB → 1MB.
- **Memory Optimization — Score Matrix**: Greedy matcher is now **matrix-free** — streams scores and keeps only above-threshold candidates (O(C) memory, not O(N×M)). Hungarian still uses float matrix but bounded to ≤200×200 (320KB). Eliminates all unbounded RAM growth.
- **Hard Limits**: `MAX_TRANSACTIONS=3000`, `MAX_DOCUMENTS=5000` in matcher. Exceeding returns error instead of OOM. 10 concurrent users safe.
- **scipy**: Not added to requirements.txt (150MB+ RAM). Greedy matcher sufficient. Log level changed from `warning` to `debug`.
- **Frontend Status Polling**: `useMatchingStatus` hook checks on mount if matching is in progress; polls every 3s until done. Navigate away and return — spinner persists.
- **Refactored**: `_tx_to_input`, `_doc_to_input`, `_build_match_doc` moved from `reconciliation_service.py` to `reconciliation_helpers.py` (kept service under 500 lines)
- **Files Modified**: `reconciliation_repository.py` (289), `reconciliation_service.py` (497), `reconciliation_matcher.py` (180), `reconciliation_helpers.py` (153), `routes/reconciliation.py` (260), `reconciliationApi.ts` (153), `MatchingPanel.tsx` (400), `useMatchingStatus.ts` (new, 56)

### 02 Mar 2026 - Currency Detection: Remove TRY Default, Fix LLM Prompt
- **Problem**: LLM was told "Default TRY if no symbol found" → EUR/USD invoices sometimes came back as TRY. Every fallback in the codebase also defaulted to TRY, masking detection failures. Dashboard stats grouped unknown currencies under TRY incorrectly.
- **Solution**: Tell LLM "return null if uncertain". Remove all hardcoded TRY defaults. Frontend shows plain number (no symbol) when currency is null. Dashboard groups unknown currencies under "UNKNOWN" instead of TRY.
- **Changes**:
  - `llm_extraction_service.py`: Prompt updated, `_convert_to_standard_format()` uses `or None`, `_empty_extracted_data()` currency=None, post-processing only fires on null (trusts LLM when it returns TRY/EUR/USD)
  - `bank_statement_extractor.py`: Same pattern — prompt, `_convert_header()`, `empty_bank_statement_data()`, post-processing
  - `reconciliation_service.py`: 2 lines `or 'TRY'` → `or None`
  - `stats_repository.py`: `_currency_normalize_stage()` default changed from 'TRY' to 'UNKNOWN'
  - Frontend: `formatCurrency()` in InvoiceList, BankStatements, TransactionsTable — null currency → `amount.toLocaleString()` (no symbol). All `|| 'TRY'` fallbacks → `|| ''`. Currency edit dropdown gets empty "—" option.
- **Backward compatible**: Existing docs with "TRY" in DB are unaffected. Only new uploads benefit from better detection.

### 03 Mar 2026 - Cross-Currency Reconciliation with Normalized Amounts
- **Problem**: Multi-currency accounts (e.g. Wise) charge in one currency (39.99 EUR) from another currency's balance (37.50 CHF). Matching compared raw amounts → no match.
- **Solution**: Normalize all amounts to EUR using ECB exchange rates. Matching uses normalized amounts.
- **Exchange Rate Source**: Frankfurter API (frankfurter.dev) — free, unlimited, ECB data, no API key.
- **Design Principle**: Rates stored in local DB (`exchange_rates` collection). `convert()` reads DB only; API called only for sync/update.
- **Document Normalization**: `_convert_to_standard_format()` adds `normalized_amount`, `normalized_currency` (EUR), `exchange_rate_used` to `extracted_data`.
- **Bank Statement Normalization**: Each transaction gets same fields. Wise card transactions parsed via regex to extract original amount/currency from description.
- **Wise Card Parsing**: `"Card transaction of 39.99 EUR issued by Db Vertrieb"` → `original_amount=39.99, original_currency=EUR` → normalized_amount=39.99 (no conversion needed).
- **User Edit Re-normalization**: When user edits currency/total_amount/net_amount/invoice_date, `normalized_amount` is recalculated. Bank statement currency change recalculates ALL transactions.
- **Matching Integration**: `reconciliation_helpers.py` updated — `tx_to_input()` and `doc_to_input()` use normalized amounts. `DOC_PROJECTION` includes normalized fields. `score_amount()` unchanged (inputs now normalized).
- **Daily Scheduler**: Background thread updates rates once per day (1 API call).
- **Fallback**: If no rate found for exact date, nearest previous date used (weekends/holidays). If normalization fails entirely, raw amounts used (backward compatible).
- **Frontend**: No changes — users see original amounts/currencies. Normalization is backend-only for matching.
- **New Files**: `repositories/exchange_rate_repository.py` (44), `services/exchange_rate_service.py` (202), `routes/exchange_rates.py` (59)
- **Modified Files**: `llm_extraction_service.py` (+6), `bank_statement_extractor.py` (+10), `document_service.py` (+40), `reconciliation_helpers.py` (+30 rewrite), `reconciliation_service.py` (+3), `app.py` (+17), `database.py` (+3)
- **Setup**: `POST /api/exchange-rates/sync` to seed 2020→today rates (one-time). Daily update auto-starts with server.
