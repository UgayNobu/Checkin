// Check-in codes: 6 characters, no look-alikes (no 0/O, 1/I/L) so they're easy to read off a projector.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const generateCheckInCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const normalizeCode = (input) => String(input || '').trim().toUpperCase().replace(/\s+/g, '');
const isValidCodeFormat = (code) => /^[A-Z0-9]{6}$/.test(code); // also accepts older codes made with 0-9 A-Z
const isCodeStillValid = (expiry) => new Date(expiry).getTime() > Date.now();

module.exports = { generateCheckInCode, normalizeCode, isValidCodeFormat, isCodeStillValid, CODE_LENGTH };
