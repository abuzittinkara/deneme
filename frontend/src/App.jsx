import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';
import CallScreen from './components/CallScreen.jsx';

export default function App() {
  const [screen, setScreen] = useState('login');

  useEffect(() => {
    if (window.initScreenRefs) {
      window.initScreenRefs();
    }
  }, [screen]);

  return (
    <>
      {screen === 'login' && <LoginForm onSwitch={() => setScreen('register')} />}
      {screen === 'register' && (
        <RegisterForm onSwitch={() => setScreen('login')} />
      )}
      <CallScreen />
    </>
  );
}
