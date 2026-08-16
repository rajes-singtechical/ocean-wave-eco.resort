const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const OTP_FILE = path.join(DATA_DIR, "otps.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, "[]");
if (!fs.existsSync(OTP_FILE)) fs.writeFileSync(OTP_FILE, "{}");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT));

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function cleanPhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}
function isAdmin(req) {
  const key = req.headers["x-admin-key"] || req.query.key;
  return process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}
function now() { return new Date().toISOString(); }

async function sendEmail(subject, html) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return { ok:false, skipped:true };
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL || "oceanwave.eco.resort@gmail.com",
    subject,
    html
  });
  return { ok:true };
}

async function sendWhatsAppTemplate(booking) {
  // WhatsApp Cloud API requires an approved message template for business-initiated notifications.
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_NUMBER_ID || !process.env.WA_TEMPLATE_NAME) {
    return { ok:false, skipped:true };
  }
  const url = `https://graph.facebook.com/v23.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: cleanPhone(process.env.ADMIN_WHATSAPP || "917894250119").replace("+",""),
    type: "template",
    template: {
      name: process.env.WA_TEMPLATE_NAME,
      language: { code: process.env.WA_TEMPLATE_LANGUAGE || "en_US" },
      components: [{
        type: "body",
        parameters: [
          { type:"text", text: booking.name },
          { type:"text", text: booking.phone },
          { type:"text", text: booking.email },
          { type:"text", text: `${booking.checkin} to ${booking.checkout}` },
          { type:"text", text: booking.guests || "-" },
          { type:"text", text: booking.stayType || "-" }
        ]
      }]
    }
  };
  const r = await fetch(url, {
    method:"POST",
    headers:{ "Authorization":`Bearer ${process.env.WA_TOKEN}`, "Content-Type":"application/json" },
    body:JSON.stringify(body)
  });
  const data = await r.json();
  return { ok:r.ok, data };
}

async function sendOTP(phone) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
    return { ok:false, configured:false, message:"OTP provider is not configured." };
  }
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const params = new URLSearchParams({ To:phone, Channel:"sms" });
  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    { method:"POST", headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"}, body:params }
  );
  const data = await r.json();
  return { ok:r.ok, configured:true, data };
}

async function checkOTP(phone, code) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
    return { ok:false, configured:false };
  }
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const params = new URLSearchParams({ To:phone, Code:code });
  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    { method:"POST", headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"}, body:params }
  );
  const data = await r.json();
  return { ok:r.ok && data.status === "approved", configured:true, data };
}

// Send OTP: user must enter a phone number and then the received code.
app.post("/api/otp/send", async (req,res)=>{
  const phone = cleanPhone(req.body.phone);
  if (phone.length < 8) return res.status(400).json({error:"Enter a valid mobile number."});
  try {
    const result = await sendOTP(phone);
    if (!result.configured) return res.status(503).json({error:"OTP service is not configured. Add Twilio Verify settings in .env."});
    res.json({ok:result.ok, message: result.ok ? "OTP sent." : "Could not send OTP.", provider:result.data});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post("/api/otp/verify", async (req,res)=>{
  const phone = cleanPhone(req.body.phone), code = String(req.body.code || "").trim();
  if (!phone || !code) return res.status(400).json({error:"Phone and OTP are required."});
  try {
    const result = await checkOTP(phone, code);
    if (!result.configured) return res.status(503).json({error:"OTP service is not configured."});
    res.json({verified:result.ok, message:result.ok ? "Mobile number verified." : "Invalid or expired OTP."});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Booking endpoint: verification token is required when OTP mode is enabled.
app.post("/api/bookings", async (req,res)=>{
  const b = req.body || {};
  const booking = {
    id: crypto.randomUUID(),
    createdAt: now(),
    name:String(b.name||"").trim(),
    phone:cleanPhone(b.phone),
    email:String(b.email||"").trim(),
    checkin:String(b.checkin||""),
    checkout:String(b.checkout||""),
    guests:String(b.guests||""),
    stayType:String(b.stayType||""),
    message:String(b.message||""),
    phoneVerified:Boolean(b.phoneVerified)
  };
  if (!booking.name || !booking.phone || !booking.email || !booking.checkin || !booking.checkout)
    return res.status(400).json({error:"Name, mobile, email, check-in and check-out are required."});
  if (process.env.REQUIRE_PHONE_VERIFICATION === "true" && !booking.phoneVerified)
    return res.status(400).json({error:"Please verify the mobile number with OTP before booking."});

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  const html = `
    <h2>New Ocean Wave Eco Resort Booking</h2>
    <table cellpadding="8" cellspacing="0" border="1">
      <tr><td><b>Name</b></td><td>${booking.name}</td></tr>
      <tr><td><b>Mobile</b></td><td>${booking.phone} ${booking.phoneVerified ? "✓ Verified" : ""}</td></tr>
      <tr><td><b>Email</b></td><td>${booking.email}</td></tr>
      <tr><td><b>Check-in</b></td><td>${booking.checkin}</td></tr>
      <tr><td><b>Check-out</b></td><td>${booking.checkout}</td></tr>
      <tr><td><b>Guests</b></td><td>${booking.guests}</td></tr>
      <tr><td><b>Stay</b></td><td>${booking.stayType}</td></tr>
      <tr><td><b>Message</b></td><td>${booking.message || "-"}</td></tr>
    </table>`;

  let emailResult={ok:false}, waResult={ok:false};
  try { emailResult = await sendEmail(`New Ocean Wave Booking — ${booking.name}`, html); } catch(e) { emailResult={ok:false,error:e.message}; }
  try { waResult = await sendWhatsAppTemplate(booking); } catch(e) { waResult={ok:false,error:e.message}; }

  res.json({ok:true, booking, notifications:{email:emailResult, whatsapp:waResult}});
});

// Admin API
app.get("/api/admin/bookings", (req,res)=>{
  if(!isAdmin(req)) return res.status(401).json({error:"Unauthorized"});
  res.json(readJSON(BOOKINGS_FILE, []));
});

app.get("/api/admin/export.csv", (req,res)=>{
  if(!isAdmin(req)) return res.status(401).send("Unauthorized");
  const rows=readJSON(BOOKINGS_FILE,[]);
  const headers=["id","createdAt","name","phone","email","checkin","checkout","guests","stayType","message","phoneVerified"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv=[headers.join(","),...rows.map(r=>headers.map(h=>esc(r[h])).join(","))].join("\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition","attachment; filename=ocean-wave-bookings.csv");
  res.send(csv);
});

// Simple chat bot
app.post("/api/chat", (req,res)=>{
  const q=String(req.body.message||"").toLowerCase();
  let answer="I can help with rooms, pricing, check-in/out, experiences, or booking. What would you like to know?";
  if(/price|rate|cost|₹|room/.test(q)) answer="Our demo rooms start at ₹9,500/night for the Garden Suite, ₹12,500/night for the Ocean View Villa and ₹16,500/night for the Family Beach House.";
  else if(/check.?in|arrival/.test(q)) answer="Standard check-in is from 2:00 PM. Tell us your arrival time in the booking form.";
  else if(/check.?out|departure/.test(q)) answer="Standard check-out is by 11:00 AM.";
  else if(/phone|call|contact/.test(q)) answer="Reservations: +91 90000 00000. You can also submit the booking form.";
  else if(/book|reserve|reservation/.test(q)) answer="Absolutely. Tap “Book Your Stay” and complete your dates, name, mobile number and email.";
  else if(/wifi|internet/.test(q)) answer="Wi‑Fi is available for guests across the resort.";
  else if(/hello|hi|hey/.test(q)) answer="Hello 👋 Welcome to Ocean Wave Eco Resort. How can I help you plan your stay?";
  res.json({answer});
});

app.listen(PORT, ()=>console.log(`Ocean Wave server running at http://localhost:${PORT}`));
