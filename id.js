const crypto = require('crypto');

/**
 * Generate a unique session ID with SURYA-X~ prefix
 */
function generateSessionId() {
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `SURYA-X~${random}`;
}

/**
 * Validate phone number format (international)
 */
function validatePhone(number) {
  const cleaned = number.replace(/[\s\-\(\)\+]/g, '');
  return /^\d{7,15}$/.test(cleaned);
}

/**
 * Format phone to WhatsApp JID
 */
function toJID(number) {
  const cleaned = number.replace(/[\s\-\(\)\+]/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

module.exports = {
  generateSessionId,
  validatePhone,
  toJID
};
