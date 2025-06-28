import React, { useState } from 'react';

export default function LoginForm({ onSwitch }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shakeUser, setShakeUser] = useState(false);
  const [shakePass, setShakePass] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const userVal = username.trim();
    const passVal = password.trim();
    setError('');
    setShakeUser(false);
    setShakePass(false);
    if (!userVal || !passVal) {
      setError('Lütfen gerekli alanları doldurunuz');
      setShakeUser(true);
      setShakePass(true);
      return;
    }
    if (window.socket) {
      window.socket.emit('login', { username: userVal, password: passVal });
    }
  };

  return (
    <div id="loginScreen" className="screen-container" style={{ display: 'block' }}>
      <div className="card">
        <h1 className="app-title">Oturum Aç</h1>
        <p
          id="loginErrorMessage"
          style={{ display: error ? 'block' : 'none', color: '#f44', margin: '0 0 0.6rem', fontSize: '0.9rem' }}
        >
          {error || 'Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin'}
        </p>
        <form id="loginForm" autoComplete="on" onSubmit={handleSubmit}>
          <input
            type="text"
            id="loginUsernameInput"
            name="username"
            autoComplete="username"
            placeholder="Kullanıcı Adı"
            className={`input-text${shakeUser ? ' shake' : ''}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            id="loginPasswordInput"
            name="password"
            autoComplete="current-password"
            placeholder="Parola"
            className={`input-text${shakePass ? ' shake' : ''}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button id="loginButton" type="submit" className="btn primary">
            Giriş Yap
          </button>
        </form>
        <p style={{ marginTop: '1rem' }}>
          Hesabın yok mu?
          <span
            id="showRegisterScreen"
            style={{ color: '#fff', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={onSwitch}
          >
            Yeni Hesap Oluştur
          </span>
        </p>
      </div>
    </div>
  );
}
