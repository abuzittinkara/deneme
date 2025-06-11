export function attemptRegister(socket, elements) {
  const {
    regUsernameInput,
    regNameInput,
    regSurnameInput,
    regBirthdateInput,
    regEmailInput,
    regPhoneInput,
    regPasswordInput,
    regPasswordConfirmInput,
    registerErrorMessage
  } = elements;

  console.log("🔐 attemptRegister tetiklendi");

  const usernameVal = regUsernameInput.value.trim();
  const nameVal     = regNameInput.value.trim();
  const surnameVal  = regSurnameInput.value.trim();
  const birthVal    = regBirthdateInput.value.trim();
  const emailVal    = regEmailInput.value.trim();
  const phoneVal    = regPhoneInput.value.trim();
  const passVal     = regPasswordInput.value.trim();
  const passConfVal = regPasswordConfirmInput.value.trim();

  registerErrorMessage.style.display = 'none';
  [regUsernameInput, regPasswordInput, regPasswordConfirmInput].forEach(el => el.classList.remove('shake'));

  if (!usernameVal || !nameVal || !surnameVal || !birthVal || !emailVal || !phoneVal || !passVal || !passConfVal) {
    registerErrorMessage.textContent = 'Lütfen tüm alanları doldurunuz.';
    registerErrorMessage.style.display = 'block';
    return;
  }

  if (usernameVal !== usernameVal.toLowerCase()) {
    registerErrorMessage.textContent = 'Kullanıcı adı sadece küçük harf olmalı!';
    registerErrorMessage.style.display = 'block';
    regUsernameInput.classList.add('shake');
    return;
  }

  if (passVal !== passConfVal) {
    registerErrorMessage.textContent = 'Parolalar eşleşmiyor!';
    registerErrorMessage.style.display = 'block';
    regPasswordInput.classList.add('shake');
    regPasswordConfirmInput.classList.add('shake');
    return;
  }

  const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!complexityRegex.test(passVal)) {
    registerErrorMessage.textContent = 'Parola en az 8 karakter, büyük/küçük harf, rakam ve özel karakter içermeli.';
    registerErrorMessage.style.display = 'block';
    regPasswordInput.classList.add('shake');
    return;
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
}

export function attemptLogin(socket, usernameInput, passwordInput, errorElem) {
  const usernameVal = usernameInput.value.trim();
  const passwordVal = passwordInput.value.trim();
  errorElem.style.display = 'none';
  usernameInput.classList.remove('shake');
  passwordInput.classList.remove('shake');
  if (!usernameVal || !passwordVal) {
    errorElem.textContent = 'Lütfen gerekli alanları doldurunuz';
    errorElem.style.display = 'block';
    usernameInput.classList.add('shake');
    passwordInput.classList.add('shake');
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
}
