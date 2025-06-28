import React, { useState } from 'react';

export default function RegisterForm({ onSwitch }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [shakeUser, setShakeUser] = useState(false);
  const [shakePass, setShakePass] = useState(false);
  const [shakePassConf, setShakePassConf] = useState(false);

  const handleRegister = () => {
    const u = username.trim();
    const n = name.trim();
    const s = surname.trim();
    const b = birthdate.trim();
    const e = email.trim();
    const p = phone.trim();
    const pw = password.trim();
    const pwc = passwordConfirm.trim();
    setError('');
    setShakeUser(false);
    setShakePass(false);
    setShakePassConf(false);

    if (!u || !n || !s || !b || !e || !p || !pw || !pwc) {
      setError('Lütfen tüm alanları doldurunuz.');
      return;
    }
    if (u !== u.toLowerCase()) {
      setError('Kullanıcı adı sadece küçük harf olmalı!');
      setShakeUser(true);
      return;
    }
    if (pw !== pwc) {
      setError('Parolalar eşleşmiyor!');
      setShakePass(true);
      setShakePassConf(true);
      return;
    }
    const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!complexityRegex.test(pw)) {
      setError('Parola en az 8 karakter, büyük/küçük harf, rakam ve özel karakter içermeli.');
      setShakePass(true);
      return;
    }
    if (window.socket) {
      window.socket.emit('register', {
        username: u,
        name: n,
        surname: s,
        birthdate: b,
        email: e,
        phone: p,
        password: pw,
        passwordConfirm: pwc,
      });
    }
  };

  return (
    <div id="registerScreen" className="screen-container" style={{ display: 'none' }}>
      <div className="card">
        <h1 className="app-title">Kayıt Ol</h1>
        <p
          id="registerErrorMessage"
          style={{ display: error ? 'block' : 'none', color: '#f44', margin: '0 0 0.6rem', fontSize: '0.9rem' }}
        >
          {error || 'Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin'}
        </p>
        <input
          type="text"
          id="regUsernameInput"
          placeholder="Kullanıcı Adı (küçük harf)"
          className={`input-text${shakeUser ? ' shake' : ''}`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="text"
          id="regNameInput"
          placeholder="İsim"
          className="input-text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          id="regSurnameInput"
          placeholder="Soyisim"
          className="input-text"
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
        />
        <input
          type="date"
          id="regBirthdateInput"
          className="input-text"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
        />
        <input
          type="email"
          id="regEmailInput"
          placeholder="E-Posta"
          className="input-text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="tel"
          id="regPhoneInput"
          placeholder="Telefon Numarası"
          className="input-text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="password"
          id="regPasswordInput"
          placeholder="Parola"
          className={`input-text${shakePass ? ' shake' : ''}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          id="regPasswordConfirmInput"
          placeholder="Parola(Tekrar)"
          className={`input-text${shakePassConf ? ' shake' : ''}`}
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />
        <button id="registerButton" className="btn primary" onClick={handleRegister}>
          Kayıt Ol ve Başla
        </button>
        <button id="backToLoginButton" className="btn secondary" onClick={onSwitch}>
          Geri Gel
        </button>
        <p style={{ marginTop: '1rem' }}>
          Zaten hesabın var mı?
          <span
            id="showLoginScreen"
            style={{ color: '#fff', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={onSwitch}
          >
            Oturum Aç
          </span>
        </p>
      </div>
    </div>
  );
}
