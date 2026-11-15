const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Token payload is { id, role, tv } — role uses the API name ('teacher', not 'tutor'); tv = the user's
 * token_version when the token was made (a token older than the current version is refused).
 */
const signAuthToken = (user) => jwt.sign({ id: user.id, role: user.role, tv: user.tokenVersion ?? 0 }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
const verifyAuthToken = (token) => jwt.verify(token, env.jwtSecret);

module.exports = { signAuthToken, verifyAuthToken };
