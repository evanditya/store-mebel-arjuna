# OttoPay API Secure Page (Hosted) v3.0.2 — Dokumentasi Integrasi

> **Dokumen ini dibuat untuk memandu migrasi dari Midtrans ke OttoPay** pada project marketplace di Replit.
> Versi API: **v3.0.2** | Revisi: **13/03/2024**

---

## 📋 Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Environment & URL](#2-environment--url)
3. [Autentikasi & Signature](#3-autentikasi--signature)
4. [API Request Payment (Create Token)](#4-api-request-payment-create-token)
5. [API Check Status](#5-api-check-status)
6. [Callback / Webhook](#6-callback--webhook)
7. [Migrasi dari Midtrans](#7-migrasi-dari-midtrans)
8. [Kartu Uji Sandbox](#8-kartu-uji-sandbox)
9. [Appendix](#9-appendix)

---

## 1. Gambaran Umum

OttoPay Hosted API menggunakan model **Secure Payment Page** — mirip dengan Midtrans Snap. Alur kerjanya:

1. **Backend** merchant memanggil API OttoPay untuk membuat token/session pembayaran.
2. OttoPay mengembalikan **`endpointUrl`** (URL halaman pembayaran).
3. **Frontend** redirect buyer ke `endpointUrl`.
4. Buyer menyelesaikan pembayaran di halaman OttoPay.
5. OttoPay mengirim **callback** ke URL merchant.

### Diagram Alur

```
┌─────────────┐      POST /token       ┌─────────────┐
│   Merchant  │ ─────────────────────>│   OttoPay   │
│   Backend   │                       │   Backend   │
└─────────────┘                       └─────────────┘
       │                                    │
       │ {"endpointUrl": "..."}            │
       │<───────────────────────────────────│
       │                                    │
       │ Redirect buyer ke endpointUrl      │
       │                                    │
       │                                    ▼
       │                            ┌─────────────┐
       │                            │  OttoPay    │
       │                            │  Secure Page│
       │                            └─────────────┘
       │                                    │
       │         POST Callback              │
       │<───────────────────────────────────│
       │                                    │
       ▼                                    │
┌─────────────┐                            │
│   Merchant  │                            │
│   Webhook   │────────────────────────────>│
│   Handler   │    {"responseCode":"00"}   │
└─────────────┘                            │
                                           ▼
```

---

## 2. Environment & URL

| Environment | Base URL |
|---|---|
| **Sandbox** | `https://sandbox-secure-api.ottopay.id/securepage-be` |
| **Production** | `https://secure.ottopay.id` |

### Endpoint API

| Aksi | Endpoint | Method |
|---|---|---|
| Create Payment Token | `/payment-services/v2.1.0/api/token` | `POST` |
| Check Transaction Status | `/sp/service/v3.0.0/api/checkstatus` | `POST` |
| Callback (Webhook) | URL merchant (konfigurasi di OttoPay) | `POST` |

---

## 3. Autentikasi & Signature

Setiap request ke API OttoPay **WAJIB** menyertakan 3 header HTTP:

| Header | Tipe | Deskripsi |
|---|---|---|
| `Timestamp` | integer | Unix timestamp (contoh: `1614070898`) |
| `Authorization` | string | `Basic <base64(MerchantID)>` |
| `Signature` | string | HMAC-SHA512 dari string khusus |

### 3.1 Cara Generate Signature

Signature OttoPay menggunakan **HMAC-SHA512** dengan secret = **API Key**.

#### Langkah-langkah:

1. **Sort** key JSON body secara alfabetis (A→Z, lalu a→z).
2. **Trim** dan regex hanya izinkan karakter `[a-zA-Z0-9{}:.,]` — hapus spasi, tanda petik, `@`, `-`, `/`, dll.
3. **Lowercase** hasilnya.
4. **Append** string dengan `&timestamp&APIKEY`.
5. **Encrypt** dengan HMAC-SHA512 menggunakan API Key sebagai secret.

#### Contoh Data

**Body Request:**
```json
{"customerDetails":{"email":"jihan.nabilah@ottodigital.id","firstName":"jihan","lastName":"jihan","phone":"6283833507372"},"expiryDuration":"1h","transactionDetails":{"amount":2135,"currency":"IDR","merchantName":"BUMAME","orderId":"092021-162135","promoCode":"","vaOrderId":"","vabca":"","valain":"","vamandiri":""}}
```

**Setelah regex + lowercase:**
```
{customerdetails:{email:jihan.nabilahottodigital.id,firstname:jihan,lastname:jihan,phone:6283833507372},expiryduration:1h,transactiondetails:{amount:2135,currency:idr,merchantname:bumame,orderid:092021162135,promocode:,vaorderid:,vabca:,valain:,vamandiri:}}
```

**Plaintext sebelum HMAC-SHA512:**
```
{customerdetails:{email:jihan.nabilahottodigital.id,firstname:jihan,lastname:jihan,phone:6283833507372},expiryduration:1h,transactiondetails:{amount:2135,currency:idr,merchantname:bumame,orderid:092021162135,promocode:,vaorderid:,vabca:,valain:,vamandiri:}}&1614070898&YI02BEAE53PKBO5Y9KP1K05P01P05P8E
```

**Hasil HMAC-SHA512:**
```
6480235e224fa31d5a541181231dcbd0860211c97bdfdbb94328390875c45f3a312467b1f0ee04767049792a3786bd6e7a4a16e32b96c9dff7574ab8778b55f5
```

### 3.2 Kode Signature (Node.js)

```javascript
const crypto = require('crypto');

/**
 * Generate OttoPay Signature
 * @param {string} bodyJson - JSON string body request (sudah di-stringify)
 * @param {string} timestamp - Unix timestamp
 * @param {string} apiKey - API Key dari OttoPay
 * @returns {string} HMAC-SHA512 hex signature
 */
function generateSignature(bodyJson, timestamp, apiKey) {
  // Step 1: Parse dan sort key secara rekursif
  const sortedObj = sortKeys(JSON.parse(bodyJson));
  const sortedJson = JSON.stringify(sortedObj);

  // Step 2: Regex hanya izinkan [a-zA-Z0-9{}:.,]
  const stripped = sortedJson.replace(/[^a-zA-Z0-9{}:.,]/g, '');

  // Step 3: Lowercase
  const lowercased = stripped.toLowerCase();

  // Step 4: Append &timestamp&APIKEY
  const plainText = `${lowercased}&${timestamp}&${apiKey}`;

  // Step 5: HMAC-SHA512
  const signature = crypto
    .createHmac('sha512', apiKey)
    .update(plainText)
    .digest('hex');

  return signature;
}

/**
 * Sort object keys recursively (A-Z, a-z)
 */
function sortKeys(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort((a, b) => a.localeCompare(b))
      .reduce((result, key) => {
        result[key] = sortKeys(obj[key]);
        return result;
      }, {});
  }
  return obj;
}

// Contoh penggunaan:
const body = JSON.stringify({
  customerDetails: {
    email: "jihan.nabilah@ottodigital.id",
    firstName: "jihan",
    lastName: "jihan",
    phone: "6283833507372"
  },
  transactionDetails: {
    amount: 2135,
    currency: "IDR",
    merchantName: "BUMAME",
    orderId: "092021-162135",
    promoCode: "",
    vaOrderId: "",
    vabca: "",
    valain: "",
    vamandiri: ""
  },
  expiryDuration: "1h"
});

const timestamp = Math.floor(Date.now() / 1000).toString();
const apiKey = "YI02BEAE53PKBO5Y9KP1K05P01P05P8E";

const signature = generateSignature(body, timestamp, apiKey);
console.log("Signature:", signature);
```

---

## 4. API Request Payment (Create Token)

Membuat session pembayaran dan mendapatkan URL redirect ke halaman OttoPay.

### Request

```http
POST /payment-services/v2.1.0/api/token
Host: sandbox-secure-api.ottopay.id
Content-Type: application/json
Timestamp: 1614070898
Authorization: Basic T1AxQjAwMDI5MzU4
Signature: <hmac-sha512-signature>
```

#### Body Request

| Field | Tipe | Wajib | Deskripsi |
|---|---|---|---|
| `transactionDetails` | Object | ✅ | Detail transaksi |
| `transactionDetails.amount` | integer | ✅ | Nominal transaksi (bilangan bulat) |
| `transactionDetails.currency` | string | ✅ | Kode mata uang (`IDR`) |
| `transactionDetails.orderId` | string | ✅ | Order ID dari merchant. **Unik**, min 7, max 32 karakter |
| `transactionDetails.merchantName` | string | ✅ | Nama merchant yang ditampilkan di halaman pembayaran |
| `transactionDetails.paymentMethod` | int | ❌ | Kode metode pembayaran (lihat Appendix B). Default: `0` |
| `transactionDetails.promoCode` | string | ❌ | Kode promo. Jika tidak ada, **jangan kirim** |
| `transactionDetails.vabca` | string | ❌ | Nomor VA BCA (min 9 digit, untuk integrator VA) |
| `transactionDetails.vamandiri` | string | ❌ | Nomor VA Mandiri (min 9 digit) |
| `transactionDetails.vabni` | string | ❌ | Nomor VA BNI (min 9 digit) |
| `transactionDetails.vapermata` | string | ❌ | Nomor VA Permata (min 9 digit) |
| `transactionDetails.valain` | string | ❌ | Nomor VA Bank INA (min 9 digit) |
| `transactionDetails.vaOrderId` | string | ❌ | Order ID VA (numeric, unik, min 8 digit) |
| `customerDetails` | Object | ✅ | Detail customer |
| `customerDetails.firstName` | string | ✅ | Nama depan customer |
| `customerDetails.lastName` | string | ❌ | Nama belakang customer |
| `customerDetails.email` | string | ✅ | Email customer (max 255 karakter) |
| `customerDetails.phone` | string | ✅ | Nomor telepon customer |
| `expiryDuration` | string | ❌ | Durasi expiry. Default `30m`, max `720h`. Format: `30m`, `1h`, `3600s` |

#### Contoh Body Request

```json
{
  "customerDetails": {
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "6281234567890"
  },
  "transactionDetails": {
    "amount": 150000,
    "currency": "IDR",
    "merchantName": "MARKETPLACE_KU",
    "orderId": "ORDER-1234567",
    "paymentMethod": 0,
    "promoCode": "",
    "vabca": "",
    "vamandiri": "",
    "vabni": "",
    "vapermata": "",
    "valain": "",
    "vaOrderId": ""
  },
  "expiryDuration": "1h"
}
```

### Response

#### Sukses

```json
{
  "responseAuth": {
    "signature": "abc123..."
  },
  "responseData": {
    "statusCode": "00",
    "statusMessage": "SUCCESS",
    "orderId": "ORDER-1234567",
    "endpointUrl": "https://sandbox-secure.ottopay.id/securepage-fe/#/securepage?orderId=MTcwNDg2MTE2MzM2NjMwNzA0Mg=="
  }
}
```

**Langkah selanjutnya:** Redirect buyer ke `endpointUrl`.

#### Gagal

```json
{
  "responseCode": "05",
  "responseDesc": "Transaction Ref ID already exist"
}
```

### Kode Lengkap (Node.js / Express)

```javascript
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const OTTO_PAY_CONFIG = {
  sandbox: true,
  merchantId: 'OP1B00029358',      // Ganti dengan Merchant ID Anda
  apiKey: 'YI02BEAE53PKBO5Y9KP1K05P01P05P8E', // Ganti dengan API Key Anda
  baseUrl: 'https://sandbox-secure-api.ottopay.id/securepage-be'
};

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).sort((a, b) => a.localeCompare(b))
      .reduce((res, key) => { res[key] = sortKeys(obj[key]); return res; }, {});
  }
  return obj;
}

function generateSignature(bodyJson, timestamp, apiKey) {
  const sortedObj = sortKeys(JSON.parse(bodyJson));
  const sortedJson = JSON.stringify(sortedObj);
  const stripped = sortedJson.replace(/[^a-zA-Z0-9{}:.,]/g, '');
  const lowercased = stripped.toLowerCase();
  const plainText = `${lowercased}&${timestamp}&${apiKey}`;
  return crypto.createHmac('sha512', apiKey).update(plainText).digest('hex');
}

// Endpoint untuk membuat pembayaran
app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, orderId, customerEmail, customerName, customerPhone } = req.body;

    const payload = {
      customerDetails: {
        email: customerEmail,
        firstName: customerName.split(' ')[0],
        lastName: customerName.split(' ').slice(1).join(' ') || '',
        phone: customerPhone
      },
      transactionDetails: {
        amount: parseInt(amount),
        currency: 'IDR',
        merchantName: 'MARKETPLACE_KU',
        orderId: orderId,
        paymentMethod: 0,
        promoCode: '',
        vabca: '',
        vamandiri: '',
        vabni: '',
        vapermata: '',
        valain: '',
        vaOrderId: ''
      },
      expiryDuration: '1h'
    };

    const bodyString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = generateSignature(bodyString, timestamp, OTTO_PAY_CONFIG.apiKey);
    const auth = Buffer.from(OTTO_PAY_CONFIG.merchantId).toString('base64');

    const response = await axios.post(
      `${OTTO_PAY_CONFIG.baseUrl}/payment-services/v2.1.0/api/token`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Timestamp': timestamp,
          'Authorization': `Basic ${auth}`,
          'Signature': signature
        }
      }
    );

    const data = response.data;

    if (data.responseData && data.responseData.endpointUrl) {
      return res.json({
        success: true,
        redirectUrl: data.responseData.endpointUrl,
        orderId: data.responseData.orderId
      });
    } else {
      return res.status(400).json({
        success: false,
        error: data.responseDesc || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('OttoPay Error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.responseDesc || error.message
    });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

---

## 5. API Check Status

Memeriksa status transaksi secara manual (polling atau untuk verifikasi).

### Request

```http
POST /sp/service/v3.0.0/api/checkstatus
Host: sandbox-secure-api.ottopay.id
Content-Type: application/json
Timestamp: 1614070898
Authorization: Basic T1AxQjAwMDI5MzU4
Signature: <hmac-sha512-signature>
```

#### Body Request

```json
{
  "trxRef": "ORDER-1234567"
}
```

| Field | Tipe | Wajib | Deskripsi |
|---|---|---|---|
| `trxRef` | string | ✅ | OrderId dari Request Payment |

### Response Sukses (VA)

```json
{
  "responseCode": "00",
  "responseDesc": "Success",
  "trxRef": "ORDER-1234567",
  "issuer": "OTTOPAYSP",
  "issuerRefNo": "04498684301",
  "ottoRefNo": "1702623535573862313",
  "transactionStatusCode": "S",
  "transactionStatusDesc": "Sales",
  "amount": 100001,
  "transactionTime": "2023-12-15T13:59:41.083541+07:00",
  "customerId": "0811000999",
  "refundHistory": [],
  "vaBank": "BCA",
  "vaNumber": "1217301020033525",
  "paymentMethod": "VA",
  "paymentAt": "2023-12-19T11:40:26.105633+07:00"
}
```

### Response Sukses (QRIS)

```json
{
  "responseCode": "00",
  "responseDesc": "Success",
  "trxRef": "ORDER-1234567",
  "issuer": "Mandiri",
  "issuerRefNo": "131753494208",
  "ottoRefNo": "1702452573308752851",
  "transactionStatusCode": "S",
  "transactionStatusDesc": "Sales",
  "amount": 5000001,
  "transactionTime": "2023-12-13T14:30:13.868865+07:00",
  "customerId": "",
  "refundHistory": [],
  "paymentMethod": "QRIS"
}
```

### Response Gagal

```json
{
  "responseCode": "11",
  "responseDesc": "Transaction Failed",
  "trxRef": "ORDER-1234567",
  "issuer": "DEBIT/CREDIT CARD",
  "issuerRefNo": "0",
  "ottoRefNo": "1702460587724957809",
  "transactionStatusCode": "FL",
  "transactionStatusDesc": "Failed",
  "amount": 5000001,
  "transactionTime": "2023-12-13T16:44:11.746797+07:00",
  "customerId": "",
  "refundHistory": [],
  "paymentMethod": "DEBIT",
  "paymentAt": "2023-12-13T16:44:37.927985+07:00"
}
```

---

## 6. Callback / Webhook

OttoPay akan mengirimkan notifikasi status transaksi ke **URL callback** yang telah dikonfigurasi di dashboard OttoPay.

### Karakteristik Callback

- **Method:** `POST`
- **Headers:** Sama seperti request API (`Timestamp`, `Authorization`, `Signature`)
- **Retry:** Jika merchant mengembalikan HTTP status selain `200`, OttoPay akan retry **setiap menit, total 29 kali** (30 termasuk pengiriman awal).
- **Expired callback:** Dikirim ~4 menit setelah order expired.

### Body Callback

| Field | Tipe | Wajib | Deskripsi |
|---|---|---|---|
| `amount` | numeric | ✅ | Nominal transaksi |
| `bankName` | string | ❌ | Nama bank pembayaran (whitelisted = mandatory) |
| `issuer` | string | ✅ | Nama channel pembayaran |
| `issuerRefNo` | string | ✅ | Reference number dari issuer (saat sukses) |
| `ottoRefNo` | string | ✅ | Reference number dari OttoPay |
| `responseCode` | string | ✅ | Kode status (lihat Appendix C) |
| `responseDescription` | string | ✅ | Deskripsi status |
| `transactionType` | integer | ❌ | `1`=Debit/Credit, `2`=QRIS, `3`=EMoney, `4`=VA (whitelisted = mandatory) |
| `trxRef` | string | ✅ | OrderId dari merchant |
| `userId` | string | ✅ | Identifikasi user yang melakukan pembayaran |
| `paymentMethod` | string | ❌ | Metode yang dipilih user: `VA`, `VA BCA`, `VA MANDIRI`, `VA OTHER`, `QRIS`, `CREDIT`, `DEBIT` |

### Contoh Callback — Kartu Sukses

```json
{
  "amount": 150000,
  "bankName": "PT. BANK CIMB NIAGA TBK.",
  "issuer": "DEBIT CARD PT. BANK CIMB NIAGA TBK.",
  "issuerRefNo": "4480",
  "ottoRefNo": "INV-20220606143052-7846",
  "responseCode": "00",
  "responseDescription": "Success",
  "transactionType": 1,
  "trxRef": "INV-20220606143052-7846",
  "userId": "411111xxxxxx1111"
}
```

### Contoh Callback — VA Sukses

```json
{
  "amount": 21000,
  "issuer": "OTTOPAYSP",
  "issuerRefNo": "12345213900",
  "ottoRefNo": "1661270101009159466",
  "responseCode": "00",
  "responseDescription": "Success",
  "transactionType": 4,
  "trxRef": "20220823225457",
  "userId": "085767889542"
}
```

### Contoh Callback — Expired

```json
{
  "amount": 500000,
  "issuer": "",
  "issuerRefNo": "",
  "ottoRefNo": "1665991266059385646",
  "responseCode": "41",
  "responseDescription": "Transaction Expired",
  "trxRef": "Order2500048",
  "userId": "Muhammad"
}
```

### Response yang Harus Dikembalikan Merchant

```json
{
  "responseCode": "00",
  "responseDesc": "Success"
}
```

### Kode Handler Callback (Node.js)

```javascript
app.post('/webhook/ottopay', express.json(), (req, res) => {
  const { Timestamp, Authorization, Signature } = req.headers;
  const body = req.body;

  // 1. Verifikasi Authorization (Basic base64(MID))
  const expectedAuth = Buffer.from(OTTO_PAY_CONFIG.merchantId).toString('base64');
  if (Authorization !== `Basic ${expectedAuth}`) {
    return res.status(401).json({ responseCode: '25', responseDesc: 'Unauthorized' });
  }

  // 2. Verifikasi Signature
  const bodyString = JSON.stringify(body);
  const expectedSignature = generateSignature(bodyString, Timestamp, OTTO_PAY_CONFIG.apiKey);
  if (Signature !== expectedSignature) {
    return res.status(401).json({ responseCode: '27', responseDesc: 'Invalid Signature' });
  }

  // 3. Proses transaksi
  const { trxRef, responseCode, responseDescription, amount, paymentMethod } = body;

  console.log(`[OttoPay Callback] Order: ${trxRef}, Status: ${responseCode} - ${responseDescription}`);

  if (responseCode === '00') {
    // Transaksi sukses — update database, kirim email, dll
    // updateOrderStatus(trxRef, 'PAID', amount, paymentMethod);
  } else if (responseCode === '41') {
    // Transaksi expired
    // updateOrderStatus(trxRef, 'EXPIRED');
  } else if (responseCode === '39') {
    // Transaksi cancelled
    // updateOrderStatus(trxRef, 'CANCELLED');
  } else if (responseCode === '11') {
    // Transaksi failed
    // updateOrderStatus(trxRef, 'FAILED');
  }

  // 4. WAJIB kembalikan 200 + responseCode 00
  res.status(200).json({ responseCode: '00', responseDesc: 'Success' });
});
```

---

## 7. Migrasi dari Midtrans

### Perbandingan Konsep

| Aspek | Midtrans | OttoPay |
|---|---|---|
| **Model** | Hosted (Snap) + Core API | Hosted (Secure Page) + H2H API |
| **Create Payment** | `POST /snap/v1/transactions` | `POST /payment-services/v2.1.0/api/token` |
| **Redirect** | `snap.pay(token)` atau redirect ke Snap URL | Redirect ke `endpointUrl` dari response |
| **Auth** | `Server Key` + `Client Key` | `Merchant ID` + `API Key` |
| **Auth Header** | `Authorization: Basic <base64(server_key)>` | `Authorization: Basic <base64(merchant_id)>` |
| **Signature** | SHA512(`order_id+status_code+gross_amount+server_key`) | HMAC-SHA512 dari regex-stripped sorted JSON + `&timestamp&apikey` |
| **Webhook** | `notification_url` | Callback URL (konfigurasi di OttoPay) |
| **Check Status** | `GET /v2/{order_id}/status` | `POST /sp/service/v3.0.0/api/checkstatus` |
| **SDK** | Ada (snap.js, SDK Node/PHP/Python) | **Tidak ada** — raw HTTP only |
| **Expiry** | `expiry_time` (ISO timestamp) atau `custom_expiry` | `expiryDuration` string (`1h`, `30m`) |
| **Order ID** | Bebas | Min 7, max 32, **harus unik** |
| **Amount** | Integer (IDR) | Integer (IDR) — sama |

### Checklist Migrasi

- [ ] Dapatkan **Merchant ID** dan **API Key** dari OttoPay (sandbox dulu).
- [ ] Implementasi ulang fungsi **generate signature** — ini paling kritis dan berbeda total dari Midtrans.
- [ ] Ganti endpoint create transaction dari Midtrans ke OttoPay.
- [ ] Ganti mekanisme redirect: hapus `snap.js`, ganti dengan redirect langsung ke `endpointUrl`.
- [ ] Rewrite webhook handler — format callback body berbeda dari Midtrans.
- [ ] Tambahkan endpoint check status OttoPay.
- [ ] Uji dengan kartu dummy di sandbox.
- [ ] Setelah sandbox lancar, ganti ke production credentials.

---

## 8. Kartu Uji Sandbox

Gunakan kartu berikut untuk testing di environment **Sandbox**:

| Tipe | Nomor Kartu | Expiry | CVV |
|---|---|---|---|
| **Debit** | `4111111111111111` | `12/25` | `123` |
| **Credit** | `4137198118415892` | `12/22` | `222` |

---

## 9. Appendix

### Appendix A: Transaction Status Codes

| Kode | Status | Deskripsi |
|---|---|---|
| `CR` | Created | Status awal saat order dibuat |
| `N` | Pending | Status default untuk Card dan QRIS |
| `S` | Success | Transaksi berhasil disetujui issuer |
| `FL` | Failed | Transaksi ditolak oleh bank/issuer |
| `EX` | Expired | Order sudah expired |
| `CL` | Cancelled | Order dibatalkan oleh user |
| `R` | Refunded | Refund berhasil diproses oleh issuer |
| `RR` | Refund Requested | Request refund diterima oleh OttoPay |
| `RFD` | Refund Failed | Refund ditolak |
| `PRF` | Partial Refund | Partial Refund (H2H Only) |

### Appendix B: Payment Method Codes

| Kode | Metode Pembayaran |
|---|---|
| `0` | Show All (default) |
| `2` | Card Full Payment |
| `3` | Credit Installment |
| `7` | QRIS Web |
| `9` | VA BCA |
| `10` | VA Mandiri |
| `11` | VA Lain (BINA / Bank INA) |
| `12` | OTT OCASH |
| `13` | VA BRI |
| `14` | VA BNI |
| `15` | VA Permata |

### Appendix C: Response Codes

| RC | Pesan | Status Mapping | Berlaku Di |
|---|---|---|---|
| `00` | Success | `S` | Hosted & H2H API, Callback, Check Status |
| `01` | Application Type Is Not Valid | — | H2H API |
| `02` | Transaction Cannot Be Processed | — | Hosted & H2H |
| `03` | Issuer is Invalid | — | H2H API |
| `04` | Transaction Ref ID is invalid | — | Hosted & H2H, Check Status |
| `05` | Transaction Ref ID already exist | — | Hosted & H2H |
| `06` | Timeout | — | Hosted & H2H |
| `07` | Invalid Currency | — | Hosted & H2H |
| `08` | Invalid Merchant | — | Hosted & H2H |
| `09` | Inactive/Blocked Merchant | — | Hosted & H2H |
| `10` | Invalid Amount | — | Hosted & H2H |
| `11` | Transaction Failed | `FL` | Hosted & H2H, Callback, Check Status |
| `12` | Transaction Refunded | `R` | Hosted, Callback, Check Status |
| `13` | Insufficient Funds | — | H2H |
| `14` | Invalid Promo | — | Hosted |
| `15` | Expired Promo | — | Hosted |
| `16` | Cutoff In Progress | — | Hosted |
| `17` | Duplicate transmission | — | Hosted & H2H |
| `18` | System malfunction | — | Hosted & H2H |
| `19` | No Available Data | — | Hosted & H2H |
| `20` | Limit exceeded (Refund) | — | H2H |
| `21` | Account is inactive/blocked/closed | — | H2H |
| `22` | Account Not Found | — | H2H |
| `23` | Request body data invalid | — | Hosted & H2H |
| `24` | Request Header Data Invalid | — | Hosted & H2H |
| `25` | Request MerchantId and Authentication Invalid | — | Hosted & H2H |
| `26` | Duration Invalid | — | Hosted |
| `27` | Invalid Signature | — | Hosted & H2H |
| `30` | Issuer not valid | — | H2H |
| `31` | Issuer not active | — | H2H |
| `34` | Partner Refund ID Duplicate | — | H2H API |
| `35` | Request Refund | `RR` | Hosted, Check Status |
| `36` | Refund Failed | `RFD` | Hosted & H2H, Callback, Check Status |
| `37` | Refund already requested | — | Hosted API |
| `38` | Payment Method disabled | — | H2H API |
| `39` | Transaction Cancelled | `CL` | Hosted & H2H, Check Status |
| `40` | Data Cannot Be Updated | — | Hosted & H2H API |
| `41` | Transaction Expired | `EX` | Hosted & H2H, Callback |
| `68` | Pending Transaction | `N` | Hosted & H2H, Check Status |
| `99` | General Error. Please contact OttoPay Admin. | — | Hosted & H2H API |

---

## 📝 Catatan Penting

1. **Order ID harus unik** — Jika mengirim order ID yang sudah pernah digunakan, akan mendapat response `05` (Transaction Ref ID already exist).
2. **Signature sangat sensitif** — Perhatikan urutan sort key, regex stripping, dan lowercase. Satu karakter salah = signature invalid (`27`).
3. **Callback wajib response 200** — Jika tidak, OttoPay akan retry 29 kali.
4. **Tidak ada SDK** — Semua request harus dibuat manual dengan HTTP client (axios, fetch, curl, dll).
5. **Callback URL harus HTTPS** — Pastikan sudah dikonfigurasi di dashboard OttoPay.
6. **URL halaman pembayaran bisa dibuka berkali-kali** — Buyer bisa re-open URL sampai expired atau berhasil.

---

*Dokumen ini disusun berdasarkan OttoPay API Secure Payment Platform Hosted v3.0.2 (Revisi 13/03/2024).*
*Untuk bantuan teknis, hubungi OttoPay Support.*
