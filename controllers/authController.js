// Authentication handlers
const bcrypt = require('bcryptjs');

function registerAuthHandlers(io, socket, context) {
  const { User, users, onlineUsernames, groupController } = context;

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
      socket.emit('loginResult', { success: true, username: user.username });
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
      users[socket.id].username = trimmedName;
      onlineUsernames.add(trimmedName);
      if (groupController && groupController.sendGroupsListToUser) {
        await groupController.sendGroupsListToUser(io, socket.id, { User, users });
      }
    }
  });
}

module.exports = registerAuthHandlers;