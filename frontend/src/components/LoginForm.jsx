import React, { useState, useContext, useEffect } from 'react';
import { SocketContext } from '../SocketProvider.jsx';
import { attemptLogin } from '../auth';
import { ScreenContext } from '../App.jsx';
import { UserContext } from '../UserContext.jsx';

export default function LoginForm({ onSwitch }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shakeUser, setShakeUser] = useState(false);
  const [shakePass, setShakePass] = useState(false);
  const socket = useContext(SocketContext);
  const { setScreen } = useContext(ScreenContext);
  const { setUsername: setLoggedInUsername } = useContext(UserContext);

  useEffect(() => {
    if (!socket) return;
    const handleLoginResult = (data) => {
      if (data.success) {
        window.username = data.username;
        if (setLoggedInUsername) setLoggedInUsername(data.username);
        try {
          localStorage.setItem('username', data.username);
          if (data.token) localStorage.setItem('token', data.token);
        } catch (e) {}
        if (data.token) {
          socket.auth = socket.auth || {};
          socket.auth.token = data.token;
        }
        socket.emit('set-username', data.username);
        if (setScreen) setScreen('call');
      } else {
        setError('Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin');
        setShakeUser(true);
        setShakePass(true);
      }
    };
    socket.on('loginResult', handleLoginResult);
    return () => socket.off('loginResult', handleLoginResult);
  }, [socket, setScreen, setLoggedInUsername]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setShakeUser(false);
    setShakePass(false);
    const res = attemptLogin(socket, username, password);
    if (!res.ok) {
      setError(res.message || '');
      setShakeUser(true);
      setShakePass(true);
    } else {
      setError('');
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
