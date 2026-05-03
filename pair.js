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

async function createPairingSession(phoneNumber) {
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

      activeSessions.set(sessionId, { sock, phoneNumber, status: 'pending' });

      let resolved = false;

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (!sock.authState.creds.registered && !resolved) {
          try {
            await new Promise(r => setTimeout(r, 2000));
            const jid = toJID(phoneNumber);
            const code = await sock.requestPairingCode(jid);
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
        }

        if (connection === 'open') {
          const session = activeSessions.get(sessionId);
          if (session) session.status = 'connected';
          await saveCreds();
          console.log(`âœ… Session ${sessionId} connected!`);

          const jid = toJID(phoneNumber);
          await sendVCard(sock, jid);
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
          reject(new Error('Pairing code request timed out'));
        }
      }, 120000);

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