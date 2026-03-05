# Invoice Management Backend — Service Documentation

## 1. Architecture Overview

**3-Layer Architecture**: Routes → Services → Repositories

```
Port: 5004 (backend), 3003 (frontend)
Database: MongoDB Atlas (shared with Portal, RFQ Management, Invoice Checker)
File Storage: MongoDB GridFS
OCR: Google Cloud Document AI (EU)
LLM: OpenAI GPT-4o-mini
Email: Zepto Mail API
```

```
backend/
├── app.py                  # Flask app initialization, CORS, route registration
├── config.py               # Environment-based configuration
├── database.py             # MongoDB connection (Atlas + local)
├── routes/                 # HTTP handling, auth, validation
│   ├── auth.py             # B2C registration, login, verification, password reset
│   ├── auth_microsoft.py   # Microsoft SSO OAuth flow
│   ├── auth_google.py      # Google SSO OAuth flow
│   ├── auth_profile.py     # Profile update, change password
│   ├── sso_helpers.py      # Shared SSO logic (token, company creation)
│   ├── documents.py        # Document CRUD, upload, download, trash
│   ├── invoices/           # RFQ integration endpoints
│   └── stats_routes.py     # Dashboard statistics
├── services/               # Business logic, orchestration
│   ├── document_service.py # Document operations, OCR orchestration, multi-doc split
│   ├── document_ai_service.py  # Google Cloud Document AI OCR
│   ├── llm_extraction_service.py # GPT-4o-mini entity extraction
│   ├── layout/             # Multi-document detection (side-by-side, stacked, multi-page)
│   ├── rfq_service.py      # RFQ business logic
│   └── invoice_service.py  # Invoice business logic
├── repositories/           # Database operations only
├── utils/                  # Shared helpers
│   ├── auth.py             # @token_required decorator, JWT validation
│   ├── rate_limit.py       # In-memory rate limiter (per-IP)
│   ├── file_validation.py  # Magic bytes + MIME type validation
│   ├── email.py            # Zepto Mail integration + HTML templates
│   ├── bbox_matcher.py     # Bounding box matching for extracted entities
│   └── jwt_helper.py       # JWT creation helpers
└── models/                 # Pydantic models (if applicable)
```

---

## 2. Authentication System

### B2C Auth Flow
1. **Register** → Creates user (is_verified=False) + virtual company → sends 6-digit OTP via Zepto
2. **Verify Email** → Validates OTP (10-min expiry) → sets is_verified=True → returns JWT
3. **Login** → Validates credentials → returns `code: 'NOT_VERIFIED'` if unverified, JWT otherwise
4. **Forgot Password** → Sends reset code via Zepto
5. **Reset Password** → Validates reset code → updates password hash

### SSO (Microsoft + Google)
- **Flow**: Login → OAuth redirect → Callback → existing user: auto-login / new user: completion form
- **Microsoft**: Azure AD app (shared with Portal), separate redirect URI per backend
- **Google**: GCP OAuth client, captures profile photo
- **Edge cases**: B2B accounts rejected, unverified accounts auto-verified on SSO login

### JWT Token
- **Algorithm**: HS256 (shared secret across all backends)
- **Expiry**: 24 hours
- **Payload**: `user_id`, `email`, `role`, `name`, `is_admin`, `company_id`, `permissions`, `account_type`
- **Password hashing**: bcrypt with 12 rounds

---

## 3. Document Processing Pipeline

```
Upload → Validation → GridFS Store → Background OCR → LLM Extraction → Multi-Doc Split
```

### Step-by-step:
1. **Upload**: File received via `POST /api/documents/upload`
2. **Validation**: Extension check → size check (max 10MB) → magic bytes → MIME type
3. **GridFS**: File stored in MongoDB GridFS, reference saved in document record
4. **Background OCR**: Submitted to `ThreadPoolExecutor(max_workers=5)` — reads file from GridFS
5. **Document AI**: GCP processes bytes → returns OCR text + positional index (blocks, lines, tokens with bboxes)
6. **LLM Extraction**: GPT-4o-mini extracts 20+ fields in JSON mode (temperature=0)
7. **Bbox Matching**: Maps extracted entities to OCR bounding boxes (7 strategies)
8. **Multi-Doc Detection**: Hybrid layout analysis + LLM confirmation → splits into child documents if detected
9. **Status Update**: `ocr_status` transitions: `pending` → `processing` → `completed`/`failed`

### OCR Thread Pool
- **Max workers**: 5 concurrent OCR tasks
- **Thread naming**: `ocr-0`, `ocr-1`, ... (visible in logs)
- **Overflow**: Additional uploads queued automatically
- **Shutdown**: `atexit` handler calls `shutdown(wait=False)`

### Multi-Document Splitting
- **Detection**: Layout analysis (side-by-side, stacked, multi-page) + LLM confirmation
- **Parent/Child**: ALL extracted invoices become children. Parent is hidden container.
- **Children share**: Parent's GridFS file_ref, company_id, user_id, type

---

## 4. Security Measures

| Layer | Mechanism |
|-------|-----------|
| **Authentication** | `@token_required` on every endpoint (except auth) |
| **Authorization** | Company-scoped queries (`company_id` from JWT) |
| **File Validation** | Magic bytes verification prevents disguised files |
| **Rate Limiting** | Per-IP, in-memory (no Redis needed) |
| **CORS** | Restricted to configured origins (not `*`) |
| **Upload Limit** | `MAX_CONTENT_LENGTH = 12MB` at Flask level |
| **Password** | bcrypt (12 rounds), never logged/returned |
| **Error Messages** | Generic errors in production (no stack traces) |
| **ObjectId Validation** | try/except on all user-supplied IDs |

---

## 5. API Endpoints Reference

### Auth (`/api/auth`)

| Method | Path | Rate Limit | Auth | Purpose |
|--------|------|-----------|------|---------|
| POST | `/register` | 5/min | No | B2C user registration |
| POST | `/login` | 10/min | No | Login with email/password |
| POST | `/verify-email` | 10/min | No | Verify email with 6-digit code |
| POST | `/resend-verification` | — | No | Resend verification code |
| POST | `/forgot-password` | 5/min | No | Send password reset code |
| POST | `/reset-password` | 10/min | No | Reset password with code |
| PATCH | `/profile` | — | Yes | Update name/email, returns new JWT |
| POST | `/change-password` | — | Yes | Change password (requires current) |
| GET | `/me` | — | Yes | Get current user info |
| POST | `/profile-photo` | — | Yes | Upload base64 profile photo |

### Microsoft SSO (`/api/auth/microsoft`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/login` | No | Initiate Microsoft OAuth |
| GET | `/callback` | No | Handle Microsoft redirect |
| POST | `/complete-registration` | No | Complete new SSO user registration |

### Google SSO (`/api/auth/google`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/login` | No | Initiate Google OAuth |
| GET | `/callback` | No | Handle Google redirect |
| POST | `/complete-registration` | No | Complete new Google SSO user registration |

### Documents (`/api/documents`)

| Method | Path | Rate Limit | Auth | Purpose |
|--------|------|-----------|------|---------|
| POST | `/upload` | 10/min | Yes | Upload document (PDF/PNG/JPG) |
| GET | `/` | — | Yes | List documents (paginated) |
| GET | `/trash` | — | Yes | List soft-deleted documents (30-day) |
| POST | `/reprocess-pending` | 5/min | Yes | Re-trigger OCR on pending/failed docs |
| PATCH | `/{id}/fields` | — | Yes | Update extracted data fields |
| GET | `/{id}` | — | Yes | Get document details |
| GET | `/{id}/download` | — | Yes | Download file from GridFS |
| POST | `/{id}/restore` | — | Yes | Restore soft-deleted document |
| DELETE | `/{id}` | — | Yes | Soft-delete document |

### Invoices (`/api/invoices`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/completed-rfqs` | Yes | List completed RFQs with pagination |
| GET | `/completed-rfqs/{rfq_id}` | Yes | Get RFQ detail with offers |
| GET | `/completed-rfqs/{rfq_id}/{supplier_id}/attachments` | Yes | List supplier attachments |
| GET | `/attachments/{rfq_id}/{attachment_id}/download` | Yes | Download attachment file |
| GET | `/` | Yes | List invoices with filters |
| GET | `/{invoice_id}` | Yes | Get invoice detail |
| POST | `/{rfq_id}/upload` | Yes | Upload invoice for RFQ |
| DELETE | `/invoice/{invoice_id}` | Yes | Delete invoice |

### Stats (`/api/stats`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/dashboard` | Yes | Dashboard summary statistics |

---

## 6. File Upload Specifications

| Property | Value |
|----------|-------|
| **Max size** | 10 MB |
| **Allowed formats** | PDF, PNG, JPG, JPEG |
| **Storage** | MongoDB GridFS |
| **Validation** | Extension → Size → Magic bytes → MIME type |

### Magic Bytes Verification

| Format | Signature |
|--------|-----------|
| PDF | `%PDF` (first 4 bytes) |
| PNG | `89 50 4E 47 0D 0A 1A 0A` (first 8 bytes) |
| JPG/JPEG | `FF D8 FF` prefix (multiple variants: E0, E1, E2, DB, EE, ED) |

---

## 7. OCR Processing

### Google Cloud Document AI
- **Project**: `eco-muse-486406-i1`
- **Location**: `eu` (EU endpoint for GDPR compliance)
- **Processor ID**: `4bbdf8b1ccd53c4a`
- **Lazy loading**: Client initialized on first OCR request

### LLM Entity Extraction
- **Model**: `gpt-4o-mini`
- **Temperature**: 0 (deterministic output)
- **Response format**: JSON mode
- **Max tokens**: 2000 (extraction), 200 (multi-doc detection)

### Extracted Fields
`invoice_number`, `invoice_date`, `invoice_type`, `due_date`, `supplier_name`, `supplier_address`, `supplier_tax_id`, `supplier_email`, `supplier_phone`, `supplier_website`, `supplier_iban`, `all_ibans`, `receiver_name`, `receiver_address`, `total_amount`, `net_amount`, `total_tax_amount`, `currency`, `line_items`, `expense_category`

### Expense Categories
`food`, `fuel`, `accommodation`, `transport`, `toll`, `parking`, `office_supplies`, `communication`, `other`

---

## 8. Email System

### Provider: Zepto Mail
- **API**: `https://api.zeptomail.com/v1.1/email`
- **From**: `noreply@gordiananalytics.com` (Gordian Analytics)
- **Timeout**: 10 seconds

### Templates (Turkish)
- **Email Verification**: 6-digit code, 10-minute expiry warning
- **Password Reset**: 6-digit code, 10-minute expiry warning

---

## 9. Database

### MongoDB Atlas
- **Shared database** across Portal, RFQ Management, Invoice Checker, Invoice Management
- **Connection pool**: maxPoolSize=20, minPoolSize=5
- **SSL**: Auto-detected (certifi for Atlas, plain for localhost)

### Collections Used
| Collection | Purpose |
|-----------|---------|
| `users` | User accounts (B2C + B2B) |
| `companies` | Company records (real + virtual) |
| `documents` | Uploaded documents with OCR results (shared with Invoice Checker) |
| `rfqs` | RFQ data (read from main backend) |
| `invoices` | Invoice records |
| `supplier_product_documents` | Attachment files |
| `fs.files` / `fs.chunks` | GridFS file storage |

---

## 10. Dependencies

| Package | Purpose |
|---------|---------|
| Flask 3.0 | Web framework |
| Flask-RESTX 1.3 | REST API with Swagger docs |
| Flask-Cors 4.0 | CORS handling |
| pymongo 4.6 | MongoDB driver |
| PyJWT 2.8 | JWT token handling |
| bcrypt 4.0 | Password hashing |
| certifi | SSL certificates for Atlas |
| pydantic 2.x | Data validation |
| google-cloud-documentai 2.20+ | GCP Document AI OCR |
| msal 1.24+ | Microsoft SSO |
| requests 2.31+ | HTTP client (Zepto, Google OAuth) |
