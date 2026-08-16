# Ocean Wave Eco Resort — Booking + OTP + WhatsApp + Admin

## What this version does

1. Customer opens the website.
2. Customer enters a mobile number.
3. The site sends an OTP through **Twilio Verify**.
4. Customer enters the OTP and the site verifies the number.
5. Customer completes the booking form.
6. Booking is stored on the server in `server/data/bookings.json`.
7. Booking can be viewed in `/admin.html`.
8. Admin can export all bookings as CSV and open it in Excel.
9. If SMTP is configured, a booking email is sent to `oceanwave.eco.resort@gmail.com`.
10. If Meta WhatsApp Cloud API is configured with an approved template, a WhatsApp notification is sent to **+91 7894250119**.
11. The floating responsive chat bot answers common booking questions.

## Important limitation

A website **cannot silently discover or automatically verify a visitor's active mobile number just because they opened the site**. For privacy/security, the visitor must enter their number and receive/enter an OTP (or use another explicit verification method).

WhatsApp notifications also require an official WhatsApp Business/Cloud API setup. A normal WhatsApp number alone is not enough for a website to send automated messages.

## Install

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the values.

Start:

```bash
npm start
```

Open:

- Website: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`

## Email

Use a Gmail App Password for `SMTP_PASS` if using Gmail SMTP. Do not put a normal Gmail password in `.env`.

## WhatsApp

Create/configure Meta WhatsApp Cloud API and an approved notification template. Set:

- `ADMIN_WHATSAPP=917894250119`
- `WA_TOKEN=...`
- `WA_PHONE_NUMBER_ID=...`
- `WA_TEMPLATE_NAME=...`
- `WA_TEMPLATE_LANGUAGE=en_US`


The template body should have six variables in this order:

1. Customer name
2. Customer mobile
3. Customer email
4. Check-in → Check-out
5. Guests
6. Stay type

Example template message:

New Ocean Wave booking:
Name: {{1}}
Mobile: {{2}}
Email: {{3}}
Dates: {{4}}
Guests: {{5}}
Stay: {{6}}

## OTP

Twilio Verify is used in the sample backend. Set:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Keep these secrets on the server only.

## Production recommendation
