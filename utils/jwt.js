const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'changeme';

function sign(payload, options = {}) {
  return jwt.sign(payload, SECRET, options);
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, verify };
