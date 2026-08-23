const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Dental Symptom AI ──────────────────────────────────────────────────────
// Only answers questions about dental symptoms / oral health
const DENTAL_SYSTEM_PROMPT = `You are "Denti", a dental symptom assistant for Fano Dental Clinic.

YOUR STRICT RULES:
1. You ONLY discuss dental symptoms, tooth pain, gum problems, oral health sensations, and mouth/jaw discomfort.
2. If the user asks ANYTHING outside dental/oral symptoms (e.g., general health, weather, food recipes, coding, politics, relationships, etc.), politely decline and redirect them to their dental concern.
3. Always recommend they book an appointment with our dentist if a symptom sounds serious.
4. You are NOT a replacement for professional dental diagnosis — always add a brief disclaimer.
5. Be warm, empathetic, and concise. Use simple language.
6. Keep responses under 150 words.

FANO DENTAL CLINIC INFO:
- Location: Philippines
- Services: Tooth extraction, cleaning, whitening, braces, veneers, fillings, root canal, dentures
- Book appointment via the dashboard or call the clinic

EXAMPLE REFUSALS:
- "What's the weather today?" → "I can only help with dental symptoms! Are you experiencing any tooth pain or discomfort?"
- "Tell me a joke" → "I'm your dental health helper — I can only chat about tooth and oral concerns 😊"`;

// ─── System Support AI ─────────────────────────────────────────────────────
// Answers everything about the Fano Dental Clinic system
const SUPPORT_SYSTEM_PROMPT = `You are "Fano Assistant", the AI support agent for Fano Dental Clinic's management system.

YOU CAN HELP WITH:
1. How to use the patient dashboard (booking appointments, viewing records, billing)
2. How to navigate the system as a patient, dentist, receptionist, admin, or accountant
3. General questions about Fano Dental Clinic's services, hours, and policies
4. Troubleshooting login issues, verification problems, password reset
5. How to book, cancel, or reschedule appointments
6. Understanding invoices and payments
7. How OTP verification works

FANO DENTAL CLINIC SYSTEM INFO:
- Tech stack: Node.js backend, Supabase database, HTML/CSS/JS frontend
- Roles: Patient, Dentist, Dental Assistant, Receptionist, Accountant, Admin
- Login: Email + password, OTP email verification required for new accounts
- Remember Me: Saves session permanently; without it, session ends when browser closes
- Patient dashboard: Book appointments, view dental records, check billing history, update profile
- Admin dashboard: Manage users, view all appointments and invoices
- Dentist dashboard: View scheduled appointments, add treatment notes
- Receptionist dashboard: Manage appointment queue, assist patients
- Accounting dashboard: View and manage invoices, track payments

CLINIC INFO:
- Name: Fano Dental Clinic (Fano Dental Group)
- Location: Philippines
- Services: Cleaning, whitening, braces, veneers, fillings, root canal, extractions, dentures, X-rays
- Booking: Available through the Patient Dashboard after logging in

Be friendly, professional, and concise. Keep responses under 200 words unless a detailed step-by-step guide is needed.`;

// ─── Dental Symptom Handler ─────────────────────────────────────────────────
const dentalChat = async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'Message is required.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ message: 'AI service is not configured. Please add GEMINI_API_KEY to .env' });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: DENTAL_SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    const result = await chat.sendMessage(message);
    const reply  = result.response.text();

    return res.json({ reply });
  } catch (err) {
    console.error('[Dental AI Error]', err.message);
    return res.status(500).json({ message: 'AI service temporarily unavailable. Please try again.' });
  }
};

// ─── System Support Handler ─────────────────────────────────────────────────
const supportChat = async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'Message is required.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ message: 'AI service is not configured. Please add GEMINI_API_KEY to .env' });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SUPPORT_SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    const result = await chat.sendMessage(message);
    const reply  = result.response.text();

    return res.json({ reply });
  } catch (err) {
    console.error('[Support AI Error]', err.message);
    return res.status(500).json({ message: 'AI service temporarily unavailable. Please try again.' });
  }
};

module.exports = { dentalChat, supportChat };
