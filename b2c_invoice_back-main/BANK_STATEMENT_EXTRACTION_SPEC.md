# Bank Statement Extraction Specification

> Bu dosya bank statement extraction engine'inin gereksinimlerini, mevcut durumunu
> ve geliştirilmesi gereken noktaları tanımlar. Yeni bir conversation'da referans
> olarak kullanılabilir.

---

## 1. Kullanıcı Gereksinimleri

### İSTENEN:
- **Transaction line items (kalem kalem)**: Her bir işlem ayrı ayrı — tarih, açıklama, tutar, debit/credit tipi
- **Total debits ve total credits**: Tüm kalemlerin toplanmasından hesaplanır (header'dan değil)
- **Account holder bilgisi**: İsim + adres (varsa)
- **Tüm transaction detayları**: Reconciliation matching için — vendor adı, tutar, tarih, açıklama
- **Maksimum doğruluk**: Özellikle tutarlar ve vendor isimleri
- **Çoklu dil desteği**: Türkçe, Almanca, İngilizce, Fransızca

### İSTENMEYEN:
- ~~Opening balance~~ — kullanıcı açıkça istemedi
- ~~Closing balance~~ — kullanıcı açıkça istemedi
- ~~Minimum payment~~ — gereksiz
- ~~Account summary~~ header alanları — sadece kalemler önemli

### Kullanıcı Sözleri:
> "bank statementlarda bizim icin tek onemli sey kalemler total + - ve kalelerin
> detaylari diger seyler onemsiz ona gore yap maximum dogrulukta"

> "opening closing falan da istemiyorum bank statementta tum kalemlerden sonra
> total borcu soylesin kafi ya girdi ciktilara baksin kalem kalem bir de kisinin
> bilgileri ve adres varsa"

---

## 2. Desteklenen Banka Formatları

### 2A. Türk Bankaları (Garanti BBVA, VakıfBank) — MEVCUT, ÇALIŞIYOR

| Özellik | Garanti BBVA | VakıfBank |
|---------|-------------|-----------|
| Dil | Türkçe | İngilizce |
| Tarih | `05 Ocak 2026` veya `05.01.2026` | `05.01.2026` |
| Tutar | `1.234,56` (TR format) +/- suffix | `+1,234.56` (EN format) +/- prefix |
| Kolonlar | Tek tutar kolonu | Tek tutar kolonu |
| Credit | "ÖDEMENİZ İÇİN" keyword | "PAYMENT RECEIVED" keyword |

### 2B. Wise (TransferWise) USD Statement — YENİ, EKLENMESİ GEREKİYOR

**Örnek PDF**: `statement_125819598_USD_2025-02-05_2025-12-31.pdf`

#### Header Bilgileri:
- **Bank name**: Wise Payments Ltd.
- **Account holder**: GORDIAN ANALYTICS SA
- **Address**: Avenue de France 28, Lausanne, 1004, Switzerland
- **Currency**: USD
- **Statement period**: 5 February 2025 - 31 December 2025

#### Kolon Yapısı (4 kolon):
| Kolon | İçerik | NOT |
|-------|--------|-----|
| **Description** | Çok satırlı transaction açıklaması | İlk satır: açıklama. İkinci satır: tarih + kart bilgisi |
| **Incoming** | Credit/refund tutarı | Boş ise debit |
| **Outgoing** | Debit/charge tutarı | Boş ise credit |
| **Amount** | **RUNNING BALANCE** | ⚠️ Bu transaction tutarı DEĞİL, kalan bakiye! |

> **KRİTİK FARK**: Türk bankalarında son kolon = transaction tutarı.
> Wise'da son kolon = running balance. Transaction tutarı Incoming veya Outgoing kolonunda.

#### Tarih Formatı:
- Full İngilizce ay adı: `9 December 2025`, `30 November 2025`, `24 October 2025`
- Pattern: `D Month YYYY` (gün başında sıfır yok)
- Tarih **ikinci satırda** (ilk satırda açıklama + tutarlar)

#### Tutar Formatı:
- Standard İngilizce: `59.56`, `0.17`, `13.30`, `120.00`, `29.03`, `27.10`, `7.74`
- Binlik ayırıcı yok (gözlemlenen tutarlar <1000)
- Currency: USD (ama bazı işlemler EUR kaynaklı)

#### Transaction Tipleri:
1. **Card transaction**: `"Card transaction of 163.33 EUR issued by Amazon.de*Z96ba4074 AMAZON.DE (fee: 0.17 USD)"`
2. **Wise fee**: `"Wise Charges for: CARD-3211532649"` (ayrı satır)
3. **Refund**: Incoming kolonunda (örn. Vercel refund 120.00)
4. **Multi-currency**: EUR→USD dönüşüm, orijinal tutar açıklamada

#### Description Yapısı (2 satırlı):
```
Satır 1: Card transaction of 163.33 EUR issued by Amazon.de*Z96ba4074 AMAZON.DE (fee: 0.17 USD)    59.56    0.00
Satır 2: 9 December 2025 Card ending in 4370 CAGRI ATAC Transaction: CARD-3211532649
```
- **Satır 1**: Açıklama + Incoming/Outgoing tutarları + Running balance
- **Satır 2**: Tarih + Kart bilgisi + Cardholder adı + Transaction referans

#### Gözlemlenen Merchantlar:
- Amazon.de (EUR dönüşüm)
- Render.com
- Sinch Mailgun
- Vercel (çoklu charge + refund)
- Wise (fee charges)

#### Kart Bilgileri:
- Card ending in **4370** (CAGRI ATAC)
- Card ending in **2805** (Aytac Atac)

#### Transaction Referans:
- Kart işlemleri: `CARD-XXXXXXXXXX` (örn. CARD-3211532649)
- Fee işlemleri: `FEE-CARD-XXXXXXXXXX`

#### Sıralama:
- Ters kronolojik (en yeni üstte, en eski altta)

---

## 3. Mevcut Extractor Mimarisi

### Dosyalar:
| Dosya | Satır | Rol |
|-------|-------|-----|
| `services/bank_statement_extractor.py` | 405 | Hybrid Python+LLM ana extractor |
| `services/bank_statement_utils.py` | 286 | Parse helpers (tarih, tutar, classification) |

### Extraction Akışı:
```
1. OCR sonucu alınır (ocr_text + ocr_index)
2. _reconstruct_table_text() → OCR koordinatlarından tablo yeniden oluşturulur
   - ROW_TOL=0.008 ile Y-proximity grouping
   - Her satır tab-separated
3. _parse_transactions() → Tab-separated satırlardan transaction parse
   - İlk token tarih mi kontrol
   - Kalan tokenlardan description + amount ayır
   - "Last amount = Tutar" kuralı (Türk bankları için doğru)
4. Fallback: _parse_from_flat_text() → Düz OCR text'ten parse
5. _llm_extract_headers() → GPT-4o-mini ile header bilgileri
6. _compute_totals() → Transaction'lardan toplam hesapla
```

### Mevcut "Last Amount = Tutar" Kuralı:
```python
# _extract_transaction_from_parts() satır 183
amount, sign = amounts[-1]  # Son tutar = transaction tutarı
```
Bu kural Türk bankalarında doğru çalışır (Bonus kolonu var ama son kolon Tutar).
**Wise'da YANLIŞ** — son kolon running balance.

### Mevcut Desteklenen Tarih Formatları:
- `05 Ocak 2026` (Türkçe ay adlı)
- `15 January 2024` (İngilizce ay adlı)
- `3 März 2025` (Almanca ay adlı)
- `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`
- `YYYY-MM-DD` (ISO)

### Mevcut Desteklenen Tutar Formatları:
- Türkçe: `1.234,56` (nokta=binlik, virgül=ondalık) +/- suffix
- İngilizce: `+1,234.56` (virgül=binlik, nokta=ondalık) +/- prefix
- Space-separated: `1 234,56`
- Plain: `1234.56`
- CR/DR suffix

---

## 4. Wise İçin Gerekli Değişiklikler

### Sorun 1: "Last Amount = Tutar" Running Balance Hatası ⚠️ KRİTİK
**Problem**: Wise'da her satırın sonundaki tutar running balance, transaction tutarı değil.
**Çözüm**: Running balance detection mekanizması:
- Satırlardaki son tutarları topla → monoton değişiyorsa running balance
- Bu durumda ilk/orta tutarı transaction tutarı olarak kullan
- Alternatif: Kolon pozisyonlarını OCR x-koordinatlarından tespit et (Incoming vs Outgoing vs Amount header'larının x pozisyonu)

### Sorun 2: Çok Satırlı Transaction ⚠️ KRİTİK
**Problem**: Wise'da her transaction 2 satır:
- Satır 1: Açıklama + tutarlar
- Satır 2: Tarih + kart bilgisi + referans

Mevcut parser her satırı bağımsız işliyor.

**Çözüm**: Multi-line merging:
- Satır 1'de tutar var ama tarih yok → bekle
- Satır 2'de tarih var ama tutar yok → önceki satırla birleştir
- Veya: Tarih ikinci satırdaysa, tarihi bir önceki transaction'a ata

### Sorun 3: 3-Kolon Tutar Yapısı (Incoming/Outgoing/Balance)
**Problem**: Mevcut parser tek tutar kolonu bekliyor. Wise'da 3 ayrı kolon var.
**Çözüm**:
- OCR x-koordinatlarından kolon pozisyonları tespit et
- Header satırını bul ("Description", "Incoming", "Outgoing", "Amount")
- Her tutar tokenını x-pozisyonuna göre doğru kolona ata
- Incoming → credit, Outgoing → debit, Amount → balance (ignore)

### Sorun 4: Description Temizleme (Reconciliation İçin)
**Problem**: Wise açıklamaları çok verbose — gömülü tutarlar, kur dönüşüm bilgisi, referans kodları var.
**Çözüm**: Vendor adı extraction kuralları:
- `"Card transaction of XXX.XX EUR issued by [VENDOR]"` → "issued by" sonrasını al
- `"Wise Charges for: CARD-xxx"` → "Wise" (fee)
- Referans kodlarını temizle (`*Z96ba4074`, `CARD-3211532649`)
- Clean vendor adını `description` yerine ayrı bir `vendor_name` field'ında sakla

### Sorun 5: Fee Transaction'lar Ayrı Satır
**Problem**: Wise fee'leri ayrı satır ("Wise Charges for: CARD-xxx"), Türk bankalarında fee ayrı değil.
**Çözüm**: Fee transaction'ları normal transaction gibi parse et ama `sub_type: 'fee'` ile işaretle.

### Sorun 6: LLM Header Prompt'unda Gereksiz Alanlar
**Problem**: Mevcut prompt `opening_balance`, `closing_balance`, `minimum_payment` istiyor.
**Çözüm**: Bu alanları prompt'tan kaldır VEYA kullanıcı istemiyor diye parse edip göndermemeye gerek yok — zaten `_compute_totals()` transaction'lardan hesaplıyor. Header LLM çağrısını sadeleştir.

---

## 5. Wise Format İçin Spesifik Parsing Kuralları

### Kural 1: Running Balance Detection
```
Satır tutarları: [59.56, 0.00]  → ikisi de pozitif, biri sıfır
Running balance: her satırda farklı, monoton değişen son değer
```
- Her satırın son tutarını topla
- Ardışık satırlarda monoton artış/azalış → running balance
- Transaction tutarı = Incoming veya Outgoing kolonundaki değer

### Kural 2: Multi-Line Transaction Merge
```python
# Pseudo-code
if line_has_amounts and not line_has_date:
    pending_tx = parse_amounts_and_description(line)
elif line_has_date and not line_has_amounts:
    if pending_tx:
        pending_tx['date'] = parsed_date
        transactions.append(pending_tx)
        pending_tx = None
```

### Kural 3: Incoming vs Outgoing Kolon Tespiti
OCR x-koordinatlarından:
- Header satırını bul (x pozisyonları)
- Her tutar tokenının x-pozisyonunu kontrol et
- En yakın kolon header'ına ata
- Incoming x-range → credit
- Outgoing x-range → debit
- Amount x-range → balance (skip)

### Kural 4: Fee Transaction İşaretleme
```python
if 'Wise Charges' in description or 'wise fee' in description.lower():
    tx['sub_type'] = 'fee'
```

### Kural 5: Multi-Currency Transaction Handling
Description'dan parse et:
```python
# "Card transaction of 163.33 EUR issued by Amazon.de..."
match = re.search(r'Card transaction of ([\d,.]+)\s*(\w{3})', description)
if match:
    tx['original_amount'] = float(match.group(1))
    tx['original_currency'] = match.group(2)
# Actual USD amount = Outgoing kolonundaki değer
```

### Kural 6: Vendor Name Extraction
```python
# Pattern 1: "issued by VENDOR_NAME"
m = re.search(r'issued by\s+(.+?)(?:\s*\(fee:|\s*$)', description)
if m:
    vendor = m.group(1).strip()
    # Referans kodlarını temizle: "*Z96ba4074" pattern
    vendor = re.sub(r'\*\w+', '', vendor).strip()

# Pattern 2: "Wise Charges for: CARD-xxx" → vendor = "Wise"
if 'Wise Charges' in description:
    vendor = 'Wise'
```

### Kural 7: Transaction Çıktı Formatı
```python
{
    'date': '2025-12-09',           # ISO format
    'description': 'Card transaction of 163.33 EUR issued by Amazon.de',
    'vendor_name': 'Amazon.de',     # Clean, reconciliation-ready
    'amount': 59.56,                # USD (actual charged amount)
    'type': 'debit',                # 'debit' | 'credit'
    'sub_type': None,               # 'fee' for Wise charges, None otherwise
    'original_amount': 163.33,      # Optional: foreign currency amount
    'original_currency': 'EUR',     # Optional: foreign currency code
    'reference': 'CARD-3211532649', # Optional: transaction reference
    'balance': None,                # Not used (running balance ignored)
}
```

---

## 6. Reconciliation Matching Entegrasyonu

### Mevcut Mimari (Tamamlanmış):
```
routes/reconciliation.py → ReconciliationService → ReconciliationMatcher → ReconciliationScoring
                                                                          → ReconciliationAIVerify
                                                 → ReconciliationRepository
```

### Scoring Ağırlıkları:
| Boyut | Ağırlık | Açıklama |
|-------|---------|----------|
| **Amount** | **0.60** | En güçlü sinyal — kuruş kuruş eşleşme |
| **Date** | 0.22 | Tarih farkı tier'ları (7 gün → 1.0, 30 gün → 0.7) |
| **Description** | 0.18 | Vendor adı eşleşme (substring, word overlap, Levenshtein) |

### Matching Akışı:
1. Bank statement transaction'ları çekilir (`extracted_data.transactions`)
2. Debit → expense invoice'larıyla, Credit → income dökümanlarıyla eşleştirilir
3. Her (tx, doc) çifti için `calculate_pair_score()` hesaplanır
4. Hungarian algorithm ile optimal 1:1 atama (>200 için greedy fallback)
5. Score < 0.40 → eşleşme yok, 0.40-0.75 → AI verification, >0.75 → high confidence

### Bank Description Cleaning (Mevcut):
`reconciliation_scoring.py:clean_bank_description()` şu prefix'leri temizler:
- POS, HAVALE, EFT, VIRMAN, FATURA ÖDEME
- VISA, MASTERCARD, MAESTRO, SEPA
- ÜBERWEISUNG, LASTSCHRIFT (Almanca)
- DIRECT DEBIT, BANK TRANSFER, PAYMENT (İngilizce)

### Wise İçin Ek Cleaning Gereksinimi:
`clean_bank_description()` veya extraction sırasında:
- `"Card transaction of XXX.XX EUR/USD issued by"` prefix'i strip et
- Transaction referans kodlarını temizle (`CARD-xxx`, `FEE-CARD-xxx`)
- `"Wise Charges for:"` prefix'i strip et
- `"(fee: X.XX USD)"` suffix'i strip et
- Referans kodlarını temizle (`*Z96ba4074`)

**Önerilen yaklaşım**: Extraction sırasında `vendor_name` field'ını ayrı çıkar, reconciliation scoring'de bu field'ı kullan. Bu sayede description cleaning karmaşıklığı azalır.

### Multi-Amount Scoring (Mevcut):
```python
# reconciliation_service.py:_get_doc_amounts()
# Hem total_amount (KDV dahil) hem net_amount (KDV hariç) dener
# En iyi eşleşmeyi alır
```

### Wise Multi-Currency Not:
Wise'da EUR→USD dönüşüm var. Bank transaction tutarı USD, fatura EUR olabilir.
Mevcut scoring sadece tutar karşılaştırıyor (currency-agnostic).
- Eğer fatura EUR ve bank tx USD → tutar eşleşmeyecek
- **İleride**: Currency-aware matching (kur oranı ile dönüşüm) eklenebilir
- **Şimdilik**: Amount scoring'in %5-10 tolerance tier'ları kısmen karşılar

---

## 7. Uygulama Stratejisi

### Öncelik Sırası:
1. **Running balance detection** — Wise tutarları yanlış parse ediliyor (KRİTİK)
2. **Multi-line transaction merge** — Tarih ve açıklama birleşmeli (KRİTİK)
3. **Incoming/Outgoing kolon tespiti** — Doğru debit/credit ayrımı (KRİTİK)
4. **Vendor name extraction** — Reconciliation matching kalitesi (YÜKSEK)
5. **Fee transaction işaretleme** — Doğru sınıflandırma (ORTA)
6. **Multi-currency metadata** — İleride kullanılabilir (DÜŞÜK)
7. **LLM prompt sadeleştirme** — Gereksiz alanları kaldır (DÜŞÜK)

### Dosya Boyutu Uyarısı:
- `bank_statement_extractor.py` şu an 405 satır (limit 500)
- `bank_statement_utils.py` şu an 286 satır (limit 500)
- Wise parsing kuralları eklenince **her iki dosya da limit dahilinde kalmalı**
- Gerekirse `bank_statement_wise.py` gibi format-specific bir modül oluşturulabilir

### Yaklaşım Önerileri:
**Seçenek A — Universal Enhancement (Önerilen)**:
- Mevcut parser'a running balance detection + multi-line merge ekle
- Kolon tespitini OCR x-koordinatlarından yap (tüm formatlar için geçerli)
- Wise-specific logic minimum tut

**Seçenek B — Format-Specific Parser**:
- Wise formatını tanı (bank_name veya header pattern'dan)
- Ayrı `_parse_wise_transactions()` fonksiyonu yaz
- Daha temiz ama daha fazla kod tekrarı

---

## 8. Test Verileri

### Wise PDF (15 transaction):
| Tarih | Açıklama | Incoming | Outgoing | Balance |
|-------|----------|----------|----------|---------|
| 9 Dec 2025 | Card tx 163.33 EUR Amazon.de | — | 59.56 | 0.00 |
| 9 Dec 2025 | Wise Charges CARD-3211532649 | — | 0.17 | 59.56 |
| 3 Dec 2025 | Card tx Render.com | — | 7.74 | 59.73 |
| 3 Dec 2025 | Card tx Sinch Mailgun | — | 27.10 | 67.47 |
| 30 Nov 2025 | Card tx Vercel | — | 27.10 | 94.57 |
| 30 Nov 2025 | Card tx Vercel | — | 29.03 | 121.67 |
| 30 Nov 2025 | Card tx Vercel | — | 29.03 | 150.70 |
| 24 Oct 2025 | Vercel refund | 120.00 | — | 179.73 |
| (+ 7 more similar) | | | | |

### Beklenen Extraction Sonucu:
```json
{
  "bank_name": "Wise Payments Ltd.",
  "account_holder": "GORDIAN ANALYTICS SA",
  "account_number": null,
  "currency": "USD",
  "total_debits": 300.00,
  "total_credits": 120.00,
  "transactions": [
    {
      "date": "2025-12-09",
      "description": "Card transaction of 163.33 EUR issued by Amazon.de",
      "vendor_name": "Amazon.de",
      "amount": 59.56,
      "type": "debit"
    },
    {
      "date": "2025-12-09",
      "description": "Wise Charges for: CARD-3211532649",
      "vendor_name": "Wise",
      "amount": 0.17,
      "type": "debit",
      "sub_type": "fee"
    },
    {
      "date": "2025-10-24",
      "description": "Vercel refund",
      "vendor_name": "Vercel",
      "amount": 120.00,
      "type": "credit"
    }
  ]
}
```

---

## 9. Referans Dosyalar

| Dosya | Satır | Açıklama |
|-------|-------|----------|
| `services/bank_statement_extractor.py` | 405 | Hybrid Python+LLM extractor |
| `services/bank_statement_utils.py` | 286 | Parse helpers |
| `services/reconciliation_scoring.py` | 404 | Scoring engine (pure functions) |
| `services/reconciliation_matcher.py` | 176 | Hungarian + greedy matching |
| `services/reconciliation_service.py` | 361 | Orchestrator (DB access) |
| `services/reconciliation_ai_verify.py` | — | AI verification for uncertain matches |
| `repositories/reconciliation_repository.py` | — | DB CRUD operations |
| `routes/reconciliation.py` | — | HTTP endpoints |
