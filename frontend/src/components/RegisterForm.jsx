import React, { useState, useContext } from 'react';
import { SocketContext } from '../SocketProvider.jsx';

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
  const socket = useContext(SocketContext);

  const handleRegister = () => {
    setShakeUser(false);
    setShakePass(false);
    setShakePassConf(false);
    const res = window.attemptRegister(socket, {
      username,
      name,
      surname,
      birthdate,
      email,
      phone,
      password,
      passwordConfirm,
    });
    if (!res.ok) {
      setError(res.message || '');
      if (res.message && res.message.includes('Kullanıcı adı')) setShakeUser(true);
      if (res.message && res.message.includes('Parola')) {
        setShakePass(true);
        if (res.message.includes('eşleşmiyor')) setShakePassConf(true);
      }
    } else {
      setError('');
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
