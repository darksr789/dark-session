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
const { generateSessionId, toJID } = require('./id');

const activeSessions = new Map();

// —— Owner Info ——————————————————————————————————————————————
const OWNER_NAME   = "DARK SURYA";
const OWNER_NUMBER = "917797099719";
const WA_CHANNEL   = "https://whatsapp.com/channel/0029Vb64JNKJf05UHKREBM1h";
const WA_GROUP     = "https://chat.whatsapp.com/L0oWvAe4eeb6HBYIEPXGbo?mode=gi_t";
const REPO         = "https://github.com/darksurya345/SURYA-X";
const BOT_NAME     = "SURYA-X BOT";
// ——————————————————————————————————————————————————————————————

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
      `*⚡ ${BOT_NAME}*\n\n` +
      `*👑 Owner:* ${OWNER_NAME}\n` +
      `*📞 Number:* +${OWNER_NUMBER}\n` +
      `*📢 Channel:* ${WA_CHANNEL}\n` +
      `*👥 Group:* ${WA_GROUP}\n` +
      `*🔗 Repo:* ${REPO}\n\n` +
      `_Thanks for connecting with ${BOT_NAME}!_ ⚡\n` +
      `*⭐ Don't forget to star my repo!* 🙏`;

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

async function createPairingSession(phoneNumber) {
  const sessionId = generateSessionId();
  const sessionDir = path.join(__dirname, 'sessions', sessionId);

  // Auto-create session directory
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
        // Correction: Browser version updated for better compatibility
        browser: Browsers.macOS('Desktop'),
        
        syncFullHistory: false,
        markOnlineOnConnect: true
      });

      activeSessions.set(sessionId, { sock, phoneNumber, status: 'pending' });

      let resolved = false;

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // Handling Pairing Code Generation
        if (!sock.authState.creds.registered && !resolved) {
          // Correction: Added a longer delay to ensure socket is ready
          setTimeout(async () => {
            try {
              // Cleaning the phone number to ensure only digits are sent
              const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
              const code = await sock.requestPairingCode(cleanNumber);
              const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

              activeSessions.get(sessionId).status = 'code_generated';
              resolved = true;
              resolve({ sessionId, pairingCode: formattedCode });
            } catch (err) {
              if (!resolved) {
                resolved = true;
                reject(new Error('Failed to generate pairing code: ' + err.message));
              }
            }
          }, 3000); 
        }

        if (connection === 'open') {
          const session = activeSessions.get(sessionId);
          if (session) session.status = 'connected';
          await saveCreds();
          console.log(`✅ Session ${sessionId} connected!`);

          const jid = toJID(phoneNumber);
          await sendVCard(sock, jid);
        }

        if (connection === 'close') {
          const reason = lastDisconnect?.error?.output?.statusCode;
          // Re-attempt connection if not logged out
          if (reason !== DisconnectReason.loggedOut) {
             // Optional: Add auto-reconnect logic here if needed
          } else {
            activeSessions.delete(sessionId);
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);

      // Increased timeout for slow connections
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Pairing code request timed out. Please try again.'));
        }
      }, 150000);

    } catch (err) {
      reject(err);
    }
  });
}

function getSessionStatus(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return { status: 'not_found' };
  return { status: session.status, phoneNumber: session.phoneNumber };
}

async function closeSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    try { await session.sock.logout(); } catch (_) {}
    activeSessions.delete(sessionId);
  }
}

module.exports = {
  createPairingSession,
  getSessionStatus,
  closeSession,
  activeSessions
};
