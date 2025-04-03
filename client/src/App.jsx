import React, { useState, useContext } from 'react';
import LoginScreen from './components/Auth/LoginScreen';
import RegisterScreen from './components/Auth/RegisterScreen';
import ChatWindow from './components/Chat/ChatWindow';
import { SocketContext } from './context/SocketContext';

const App = () => {
  const socket = useContext(SocketContext);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('login'); // 'login', 'register', 'chat'
  const [username, setUsername] = useState('');

  const handleLoginSuccess = (user) => {
    setUsername(user);
    setAuthenticated(true);
    setCurrentScreen('chat');
  };

  return (
    <div className="app-container">
      {!authenticated && currentScreen === 'login' && (
        <LoginScreen 
          onLoginSuccess={handleLoginSuccess} 
          switchToRegister={() => setCurrentScreen('register')} 
        />
      )}
      {!authenticated && currentScreen === 'register' && (
        <RegisterScreen switchToLogin={() => setCurrentScreen('login')} />
      )}
      {authenticated && currentScreen === 'chat' && (
        <ChatWindow username={username} />
      )}
    </div>
  );
};

export default App;
