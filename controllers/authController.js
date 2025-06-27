// Authentication handlers
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const collectUnreadCounts = require('../utils/collectUnreadCounts');
const collectMentionCounts = require('../utils/collectMentionCounts');
const collectMuteInfo = require('../utils/collectMuteInfo');
const collectNotifyInfo = require('../utils/collectNotifyInfo');
const collectCategoryPrefs = require('../utils/collectCategoryPrefs');
const jwt = require('../utils/jwt');
const logger = require('../utils/logger');

// Rate limiters for login and registration
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const registerLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });

function checkRateLimit(limiter, key) {
  return new Promise((resolve, reject) => {
    const increment = limiter.store.increment || limiter.store.incr;
    if (!increment) return resolve(false);
    increment.call(limiter.store, key, (err, hits) => {
      if (err) return reject(err);
      resolve(hits > limiter.options.max);
    });
  });
}

function registerAuthHandlers(io, socket, context) {
  const { User, Group, GroupMember, users, onlineUsernames, groupController } = context;

  socket.on('login', async ({ username, password }) => {
    try {
      const key = `${socket.handshake.address || socket.request.ip}-${username || ''}`;
      if (await checkRateLimit(loginLimiter, key)) {
        socket.emit('loginResult', { success: false, message: 'Çok fazla giriş denemesi, lütfen daha sonra tekrar deneyin.' });
        return;
      }
      if (!username || !password) {
        socket.emit('loginResult', { success: false, message: 'Eksik bilgiler' });
        return;
      }
      const user = await User.findOne({ username });
      if (!user) {
        socket.emit('loginResult', { success: false, message: 'Kullanıcı bulunamadı.' });
        return;
      }
      const pwMatch = await bcrypt.compare(password, user.passwordHash);
      if (!pwMatch) {
        socket.emit('loginResult', { success: false, message: 'Yanlış parola.' });
        return;
      }
      const token = jwt.sign({ username: user.username, id: user._id.toString() });
      socket.emit('loginResult', { success: true, username: user.username, token });
      users[socket.id].username = user.username;
      if (groupController && groupController.sendGroupsListToUser) {
        await groupController.sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
      }
      if (
        groupController &&
        groupController.sendRoomsListToUser &&
        context.groups &&
        context.Channel &&
        context.Category
      ) {
        try {
          await user.populate('groups');
          const firstGrp = user.groups && user.groups[0];
          const gid = firstGrp ? firstGrp.groupId : null;
          if (gid) {
            await groupController.sendRoomsListToUser(
              io,
              socket.id,
              {
                groups: context.groups,
                users,
                Group,
                User,
                GroupMember,
                Channel: context.Channel,
                Category: context.Category,
                store: context.store
              },
              gid
            );
          }
        } catch (e) {
          logger.error('login sendRoomsList error: %o', e);
        }
      }
    } catch (err) {
      socket.emit('loginResult', { success: false, message: 'Giriş hatası.' });
    }
  });

  socket.on('register', async (userData) => {
    const { username, name, surname, birthdate, email, phone, password, passwordConfirm } = userData;
    try {
      logger.info('Register payload:', userData);
      const key = `${socket.handshake.address || socket.request.ip}-${username || ''}`;
      if (await checkRateLimit(registerLimiter, key)) {
        socket.emit('registerResult', { success: false, message: 'Çok fazla kayıt denemesi, lütfen daha sonra tekrar deneyin.' });
        return;
      }
      if (!username || !name || !surname || !birthdate || !email || !phone || !password || !passwordConfirm) {
        socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurunuz.' });
        return;
      }
      if (username !== username.toLowerCase()) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı küçük harf olmalı.' });
        return;
      }
      if (password !== passwordConfirm) {
        socket.emit('registerResult', { success: false, message: 'Parolalar eşleşmiyor.' });
        return;
      }
      const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
      if (!complexityRegex.test(password)) {
        socket.emit('registerResult', {
          success: false,
          message: 'Parola en az 8 karakter, bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter içermeli.'
        });
        return;
      }
      const existingUser = await User.findOne({ $or: [{ username }, { email }] });
      if (existingUser) {
        socket.emit('registerResult', { success: false, message: 'Kullanıcı adı veya e-posta zaten alınmış.' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const newUser = new User({
        username,
        passwordHash,
        name,
        surname,
        birthdate: new Date(birthdate),
        email,
        phone,
        groups: [],
        friends: []
      });
      await newUser.save();
      socket.emit('registerResult', { success: true });
      users[socket.id].username = newUser.username;
      if (groupController && groupController.sendGroupsListToUser) {
        await groupController.sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
      }
      if (
        groupController &&
        groupController.sendRoomsListToUser &&
        context.groups &&
        context.Channel &&
        context.Category &&
        newUser.groups &&
        newUser.groups.length > 0
      ) {
        try {
          await newUser.populate('groups');
          const gid = newUser.groups[0]?.groupId;
          if (gid) {
            await groupController.sendRoomsListToUser(
              io,
              socket.id,
              {
                groups: context.groups,
                users,
                Group,
                User,
                GroupMember,
                Channel: context.Channel,
                Category: context.Category,
                store: context.store
              },
              gid
            );
          }
        } catch (e) {
          logger.error('register sendRoomsList error: %o', e);
        }
      }
    } catch (err) {
      logger.error('Register error:', err);
      socket.emit('registerResult', { success: false, message: 'Kayıt hatası.' });
    }
  });

  socket.on('set-username', async (usernameVal) => {
    if (usernameVal && typeof usernameVal === 'string') {
      const trimmedName = usernameVal.trim();

      if (context.userSessions) {
        const existing = context.userSessions[trimmedName];
        if (existing && existing !== socket.id) {
          const existingSocket = io.sockets.sockets.get(existing);
          if (existingSocket) {
            existingSocket.emit('forceLogout');
            existingSocket.disconnect(true);
          }
        }
        context.userSessions[trimmedName] = socket.id;
      }
      
      users[socket.id].username = trimmedName;
      onlineUsernames.add(trimmedName);
      if (context.store) {
        context.store.setJSON(context.store.key('session', socket.id), users[socket.id]);
        context.store.addSetMember('onlineUsers', trimmedName);
      }
      if (groupController && groupController.sendGroupsListToUser) {
        await groupController.sendGroupsListToUser(io, socket.id, { User, users, GroupMember });
      }

      if (Group && GroupMember) {
        const mentions = await collectMentionCounts(trimmedName, { User, Group, GroupMember });
        socket.emit('mentionCounts', mentions);
        const unread = await collectUnreadCounts(trimmedName, { User, Group, GroupMember });
        socket.emit('unreadCounts', unread);
        const mutes = await collectMuteInfo(trimmedName, { User, Group, GroupMember });
        socket.emit('activeMutes', mutes);
        const notify = await collectNotifyInfo(trimmedName, { User, Group, GroupMember });
        socket.emit('activeNotifyTypes', notify);
        const prefs = await collectCategoryPrefs(trimmedName, { User, Group, GroupMember });
        socket.emit('activeCategoryPrefs', prefs);
      }
    }
  });
}

module.exports = registerAuthHandlers;

