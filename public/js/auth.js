import logger from '../utils/logger.js';

export function attemptRegister(socket, fields) {
  const usernameVal = (fields.username || '').trim();
  const nameVal     = (fields.name || '').trim();
  const surnameVal  = (fields.surname || '').trim();
  const birthVal    = (fields.birthdate || '').trim();
  const emailVal    = (fields.email || '').trim();
  const phoneVal    = (fields.phone || '').trim();
  const passVal     = (fields.password || '').trim();
  const passConfVal = (fields.passwordConfirm || '').trim();

  logger.info('🔐 attemptRegister tetiklendi');

  if (!usernameVal || !nameVal || !surnameVal || !birthVal || !emailVal || !phoneVal || !passVal || !passConfVal) {
    return { ok: false, message: 'Lütfen tüm alanları doldurunuz.' };
  }

  if (usernameVal !== usernameVal.toLowerCase()) {
    return { ok: false, message: 'Kullanıcı adı sadece küçük harf olmalı!' };
  }

  if (passVal !== passConfVal) {
    return { ok: false, message: 'Parolalar eşleşmiyor!' };
  }

  const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!complexityRegex.test(passVal)) {
    return { ok: false, message: 'Parola en az 8 karakter, büyük/küçük harf, rakam ve özel karakter içermeli.' };
  }

  socket.emit('register', {
    username: usernameVal,
    name: nameVal,
    surname: surnameVal,
    birthdate: birthVal,
    email: emailVal,
    phone: phoneVal,
    password: passVal,
    passwordConfirm: passConfVal
  });

  return { ok: true };
}

export function attemptLogin(socket, username, password) {
  const usernameVal = (username || '').trim();
  const passwordVal = (password || '').trim();

  if (!usernameVal || !passwordVal) {
    return { ok: false, message: 'Lütfen gerekli alanları doldurunuz' };
  }

  socket.emit('login', { username: usernameVal, password: passwordVal });
  return { ok: true };
}
