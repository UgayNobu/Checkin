const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/** Token payload is { id, role } — role uses the API name ('teacher', not 'tutor'). */
const signAuthToken = (user) => jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
const verifyAuthToken = (token) => jwt.verify(token, env.jwtSecret);

module.exports = { signAuthToken, verifyAuthToken };
