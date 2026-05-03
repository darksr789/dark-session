const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { generateSessionId } = require('./id');

const activeSessions = new Map();

// â”€â”€ Owner Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const OWNER_NAME   = "DARK SURYA";
const OWNER_NUMBER = "917797099719";
const WA_CHANNEL   = "https://whatsapp.com/channel/0029Vb64JNKJf05UHKREBM1h";
const WA_GROUP     = "https://chat.whatsapp.com/L0oWvAe4eeb6HBYIEPXGbo?mode=gi_t";
const REPO         = "https://github.com/darksurya345/SURYA-X";
const BOT_NAME     = "SURYA-X BOT";
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function sendVCard(sock, jid) {
  try {
    const vcard =
      `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `FN:${BOT_NAME}\n` +
      `ORG:${BOT_NAME};\n` +
      `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\n` +
      `END:VCARD`;

    const text =
      `*âš¡ ${BOT_NAME}*\n\n` +
      `*ðŸ‘‘ Owner:* ${OWNER_NAME}\n` +
      `*ðŸ“ž Number:* +${OWNER_NUMBER}\n` +
      `*ðŸ“¢ Channel:* ${WA_CHANNEL}\n` +
      `*ðŸ‘¥ Group:* ${WA_GROUP}\n` +
      `*ðŸ”— Repo:* ${REPO}\n\n` +
      `_Thanks for connecting with ${BOT_NAME}!_ âš¡\n` +
      `*â­ Don't forget to star my repo!* ðŸ™`;

    await sock.sendMessage(jid, { text });

    await sock.sendMessage(jid, {
      contacts: {
        displayName: BOT_NAME,
        contacts: [{ vcard }]
      }
    });
  } catch (err) {
    console.error('vCard send error:', err.message);
  }
}

async function createQRSession() {
  const sessionId = generateSessionId();
  const sessionDir = path.join(__dirname, 'sessions', sessionId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  return new Promise(async (resolve, reject) => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const logger = pino({ level: 'silent' });

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      activeSessions.set(sessionId, { sock, status: 'pending', qr: null, jid: null });

      let resolved = false;

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataURL = await QRCode.toDataURL(qr, {
              width: 300, margin: 2,
              color: { dark: '#000000', light: '#ffffff' }
            });

            const session = activeSessions.get(sessionId);
            if (session) {
              session.qr = qrDataURL;
              session.status = resolved ? 'qr_refreshed' : 'qr_ready';
            }

            if (!resolved) {
              resolved = true;
              resolve({ sessionId, qrDataURL });
            }
          } catch (err) {
            if (!resolved) {
              resolved = true;
              reject(new Error('Failed to generate QR: ' + err.message));
            }
          }
        }

        if (connection === 'open') {
          const session = activeSessions.get(sessionId);
          if (session) session.status = 'connected';
          await saveCreds();
          console.log(`âœ… QR Session ${sessionId} connected!`);

          const userJid = sock.user?.id;
          if (userJid) {
            await sendVCard(sock, userJid);
          }
        }

        if (connection === 'close') {
          const reason = lastDisconnect?.error?.output?.statusCode;
          if (reason === DisconnectReason.loggedOut) {
            activeSessions.delete(sessionId);
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('QR generation timed out'));
        }
      }, 180000);

    } catch (err) {
      reject(err);
    }
  });
}

function getQRSessionStatus(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return { status: 'not_found' };
  return { status: session.status, qr: session.qr };
}

async function closeQRSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    try { await session.sock.logout(); } catch (_) {}
    activeSessions.delete(sessionId);
  }
}

module.exports = {
  createQRSession,
  getQRSessionStatus,
  closeQRSession
};