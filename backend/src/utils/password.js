const bcrypt = require('bcryptjs');

const PASSWORD_RULE = 'Password needs 8+ characters, a number and a symbol';
const isStrongPassword = (p) => typeof p === 'string' && p.length >= 8 && /\d/.test(p) && /[^\w\s]/.test(p);

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compare(plain || '', hash || '');
// A real-looking hash so a "user not found" login takes as long as a wrong password.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Wv8Z0LkJ0eQ0sYHqvYhC3bW8Y5aW';

module.exports = { hashPassword, verifyPassword, isStrongPassword, PASSWORD_RULE, DUMMY_HASH };
