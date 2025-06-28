const express = require('express');

const User = require('../models/User');

module.exports = function createUserRouter(io) {
  const router = express.Router();
  // GET /me
  router.get('/me', async (req, res) => {
    const tokenUser = req.user && req.user.username;
    const qName = req.query.username;
    if (qName && qName !== tokenUser) return res.status(403).json({ error: 'forbidden' });
    const username = tokenUser;
    try {
      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ error: 'not found' });
      res.json({
        displayName: user.name || '',
        username: user.username,
        email: user.email || '',
        phone: user.phone || ''
      });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /me
  router.patch('/me', async (req, res) => {
    const tokenUser = req.user && req.user.username;
    const qName = req.query.username;
    const { field, value } = req.body || {};
    if (qName && qName !== tokenUser) return res.status(403).json({ error: 'forbidden' });
    if (!field) return res.status(400).json({ error: 'missing params' });
    const username = tokenUser;
    const allowed = ['displayName', 'username', 'email', 'phone'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'invalid field' });
    try {
      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ error: 'not found' });
      if (field === 'username') {
        const newName = String(value || '').trim();
        const valid = /^[a-z0-9_]+$/.test(newName) && newName === newName.toLowerCase();
        if (!valid) {
          return res.status(400).json({ error: 'invalid_username', message: 'Username format is invalid' });
        }
        const existing = await User.findOne({ username: newName });
        if (existing) {
          return res.status(409).json({ error: 'username_taken', message: 'Username already taken' });
        }
        user.username = newName;
      } else if (field === 'displayName') {
        user.name = value;
      } else if (field === 'phone' && (value === '' || value === null || value === undefined)) {
        user.phone = undefined;
      } else {
        user[field] = value;
      }
      await user.save();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /avatar
  router.get('/avatar', async (req, res) => {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'missing username' });
    try {
      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ error: 'not found' });
      res.json({ avatar: user.avatar || null });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /avatar
  router.post('/avatar', async (req, res) => {
    const username = req.query.username;
    const { avatar } = req.body || {};
    if (!username || !avatar) return res.status(400).json({ error: 'missing params' });
    try {
      const user = await User.findOne({ username });
      if (!user) return res.status(404).json({ error: 'not found' });
      user.avatar = avatar;
      await user.save();
      if (io) io.emit('avatarUpdated', { username, avatar });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};

