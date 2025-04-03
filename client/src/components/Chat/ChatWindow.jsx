import React, { useState, useEffect, useContext } from 'react';
import { SocketContext } from '../../content/SocketContext';
import TypingIndicator from '../Indicators/TypingIndicator';
import MessageItem from './MessageItem';

const ChatWindow = ({ username }) => {
  const socket = useContext(SocketContext);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  useEffect(() => {
    // Örnek: 'joinTextChannel' event'i ile default kanala katılım
    socket.emit('joinTextChannel', { channelId: 'default' });
    socket.on('newMessage', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('newMessage');
    };
  }, [socket]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    socket.emit('textMessage', { content: inputMessage, username }, (ack) => {
      // ACK ile ilgili işlemler
    });
    setInputMessage('');
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    socket.emit('typing', { username, channel: 'default' });
    // Gerçek uygulamada debounce ile stop typing event’i gönderilebilir.
  };

  return (
    <div className="chat-window">
      <div className="messages">
        {messages.map((msg, idx) => (
          <MessageItem key={idx} message={msg} />
        ))}
      </div>
      <TypingIndicator currentChannel="default" localUsername={username} />
      <div className="chat-input">
        <input 
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          placeholder="Mesaj yazın..."
        />
        <button onClick={handleSendMessage}>Gönder</button>
      </div>
    </div>
  );
};

export default ChatWindow;
