import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';

export default function App() {
  const [screen, setScreen] = useState('login');

  useEffect(() => {
    const loginEl = document.getElementById('loginScreen');
    const regEl = document.getElementById('registerScreen');
    if (loginEl) loginEl.style.display = screen === 'login' ? 'block' : 'none';
    if (regEl) regEl.style.display = screen === 'register' ? 'block' : 'none';
  }, [screen]);

  return (
    <>
      <LoginForm onSwitch={() => setScreen('register')} />
      <RegisterForm onSwitch={() => setScreen('login')} />
    </>
  );
}
