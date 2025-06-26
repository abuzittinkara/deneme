// Authentication handlers
const bcrypt = require('bcryptjs');

const collectUnreadCounts = require('../utils/collectUnreadCounts');
const collectMentionCounts = require('../utils/collectMentionCounts');
const collectMuteInfo = require('../utils/collectMuteInfo');
const collectNotifyInfo = require('../utils/collectNotifyInfo');
const collectCategoryPrefs = require('../utils/collectCategoryPrefs');
const jwt = require('../utils/jwt');

function registerAuthHandlers(io, socket, context) {
  const { User, Group, GroupMember, users, onlineUsernames, groupController } = context;

  socket.on('login', async ({ username, password }) => {
    try {
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
    } catch (err) {
      socket.emit('loginResult', { success: false, message: 'Giriş hatası.' });
    }
  });

  socket.on('register', async (userData) => {
    const { username, name, surname, birthdate, email, phone, password, passwordConfirm } = userData;
    try {
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
    } catch (err) {
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

