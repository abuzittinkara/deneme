import React, { useState, useContext } from 'react';
import { SocketContext } from '../../content/SocketContext';
import { sendLogin } from '../../services/socketService';

const LoginScreen = ({ onLoginSuccess, switchToRegister }) => {
  const socket = useContext(SocketContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (!username || !password) {
      setError('Eksik bilgiler');
      return;
    }
    sendLogin(socket, { username, password }, (response) => {
      if (response.success) {
        onLoginSuccess(username);
      } else {
        setError(response.message || 'Giriş hatası');
      }
    });
  };

  return (
    <div className="auth-screen login-screen">
      <h1>Oturum Aç</h1>
      {error && <p className="error">{error}</p>}
      <input 
        type="text" 
        placeholder="Kullanıcı Adı" 
        value={username} 
        onChange={(e) => setUsername(e.target.value)} 
      />
      <input 
        type="password" 
        placeholder="Parola" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)} 
      />
      <button onClick={handleLogin}>Giriş Yap</button>
      <p>
        Hesabın yok mu? <span onClick={switchToRegister} className="link">Yeni Hesap Oluştur</span>
      </p>
    </div>
  );
};

export default LoginScreen;
