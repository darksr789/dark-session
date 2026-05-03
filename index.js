const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createPairingSession, getSessionStatus, closeSession } = require('./pair');
const { createQRSession, getQRSessionStatus, closeQRSession } = require('./qr');
const { validatePhone } = require('./id');

const app = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('./sessions')) {
  fs.mkdirSync('./sessions');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Main Page ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Pairing Code API ──────────────────────────────────────
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });
  if (!validatePhone(phone)) return res.status(400).json({ success: false, message: 'Invalid phone number. Use international format e.g. 8801XXXXXXXXX' });

  try {
    const { sessionId, pairingCode } = await createPairingSession(phone);
    res.json({ success: true, sessionId, pairingCode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to generate pairing code' });
  }
});

app.get('/api/status/:sessionId', (req, res) => {
  res.json(getSessionStatus(req.params.sessionId));
});

app.delete('/api/session/:sessionId', async (req, res) => {
  await closeSession(req.params.sessionId);
  res.json({ success: true });
});

// ─── QR Code API ───────────────────────────────────────────
app.post('/api/qr', async (req, res) => {
  try {
    const { sessionId, qrDataURL } = await createQRSession();
    res.json({ success: true, sessionId, qrDataURL });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to generate QR code' });
  }
});

app.get('/api/qr/status/:sessionId', (req, res) => {
  res.json(getQRSessionStatus(req.params.sessionId));
});

app.delete('/api/qr/session/:sessionId', async (req, res) => {
  await closeQRSession(req.params.sessionId);
  res.json({ success: true });
});

// ─── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 SURYA-X Server running on port ${PORT}`);
});
