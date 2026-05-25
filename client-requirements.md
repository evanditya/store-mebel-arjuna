# Client Requirements Checklist — Online Store Setup

> Please prepare the following items before we begin your store setup.
> Items marked **[required]** are needed before we can launch.

---

## 1. Domain & Hosting

| Item | Notes |
|------|-------|
| Custom domain (e.g. `tokosaya.com`) | Purchase from Niagahoster, GoDaddy, Namecheap, etc. |
| Access to domain DNS settings | Needed to point the domain to the server |

---

## 2. Email — Order Notifications & Daily Reports

| Item | Notes |
|------|-------|
| **[required]** Dedicated Gmail address for the store | e.g. `notif.tokosaya@gmail.com` — do NOT use your personal Gmail |
| **[required]** Gmail App Password | Google Account → Security → 2-Step Verification → App Passwords. Guide: https://support.google.com/accounts/answer/185833 |
| Email address to receive daily sales reports | Can be any email (e.g. owner's personal email) |

> **Why App Password?** Regular Gmail passwords are blocked by Google for automated sending. An App Password is a special 16-character code generated specifically for this purpose.

---

## 3. Payment Gateway — Midtrans

| Item | Notes |
|------|-------|
| **[required]** Midtrans account | Register at https://midtrans.com |
| **[required]** Server Key | Midtrans Dashboard → Settings → Access Keys |
| **[required]** Client Key | Midtrans Dashboard → Settings → Access Keys |
| Environment | Confirm: **Sandbox** (for testing) or **Production** (live payments) |
| Business documents | KTP, NPWP, business license — required by Midtrans to activate Production mode |

---

## 4. Shipping — Biteship

| Item | Notes |
|------|-------|
| **[required]** Biteship account | Register at https://biteship.com |
| **[required]** API Key | Biteship Dashboard → API Keys |
| **[required]** Store origin address | Full address, city, and postal code — used to calculate shipping costs for customers |

---

## 5. Store Information

| Item | Notes |
|------|-------|
| **[required]** Store name | Displayed in emails, browser tab, and search results |
| Store tagline | Short slogan, optional |
| Store description | 1–2 sentences for SEO meta description |
| **[required]** Store address | Shown to customers for pickup orders and in order emails |
| **[required]** Store phone number / WhatsApp | Shown in order confirmation emails |
| Primary brand color | Hex code (e.g. `#16a34a` for green). If unsure, provide your logo and we'll match it |
| Store logo / favicon | PNG or SVG, square format, min 512×512px recommended |
| Homepage banner images | JPG/PNG, recommended size 1200×480px. Provide 2–5 images |

---

## 6. Pickup Option (if offering in-store pickup)

| Item | Notes |
|------|-------|
| Pickup days | e.g. Monday – Saturday |
| Pickup hours | e.g. 09:00 – 17:00 |

---

## 7. Product Data

| Item | Notes |
|------|-------|
| **[required]** Product list | Provided in our Excel template: product name, category, price, stock, description |
| **[required]** Product images | JPG or PNG, minimum 600×600px per image |
| Product variants (if any) | e.g. Size (S/M/L/XL), Color (Red/Blue) — each variant can have its own price and stock |

---

## 8. Admin Access

| Item | Notes |
|------|-------|
| **[required]** Owner email & password | For the main seller (super admin) account |
| Staff / sub-admin list | Name and email of each staff member, and which menus they can access: Products / Orders / Banners / Settings |

---

## 9. Optional / Nice to Have

| Item | Notes |
|------|-------|
| Google Font preference | e.g. Inter, Poppins, Playfair Display, Lato |
| Shopee store name | For automatic stock sync when Shopee orders are placed (requires the store Gmail to receive Shopee seller notifications) |

---

## Summary — Minimum to Get Started

Before we can do anything, please have these ready:

1. Gmail address + App Password
2. Midtrans Server Key + Client Key
3. Biteship API Key + store origin address
4. Store name, address, and phone number
5. Product list (Excel) + product images

Everything else (domain, banners, sub-admins, Shopee sync, etc.) can be added after the initial launch.

---

*Prepared by your developer. Questions? Reply to this document.*
