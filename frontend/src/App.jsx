import React, { useState, useEffect, createContext } from 'react';
import LoginForm from './components/LoginForm.jsx';
import RegisterForm from './components/RegisterForm.jsx';
import CallScreen from './components/CallScreen.jsx';

export const ScreenContext = createContext({ screen: 'login', setScreen: () => {} });

export default function App() {
  const [screen, setScreen] = useState('login');

  useEffect(() => {
    window.setScreen = setScreen;
    return () => {
      if (window.setScreen === setScreen) delete window.setScreen;
    };
  }, [setScreen]);

  return (
    <ScreenContext.Provider value={{ screen, setScreen }}>
      {screen === 'login' && <LoginForm onSwitch={() => setScreen('register')} />}
      {screen === 'register' && (
        <RegisterForm onSwitch={() => setScreen('login')} />
      )}
      {screen === 'call' && <CallScreen />}
    </ScreenContext.Provider>
  );
}
