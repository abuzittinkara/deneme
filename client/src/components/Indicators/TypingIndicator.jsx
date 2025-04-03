import React, { useEffect, useState, useContext } from 'react';
import { SocketContext } from '../../context/SocketContext';

const TypingIndicator = ({ currentChannel, localUsername }) => {
  const socket = useContext(SocketContext);
  const [activeTypers, setActiveTypers] = useState(new Set());

  useEffect(() => {
    const handleTyping = (data) => {
      if (data.channel === currentChannel && data.username !== localUsername) {
        setActiveTypers(prev => new Set(prev).add(data.username));
      }
    };

    const handleStopTyping = (data) => {
      if (data.channel === currentChannel && data.username !== localUsername) {
        setActiveTypers(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.username);
          return newSet;
        });
      }
    };

    socket.on('typing', handleTyping);
    socket.on('stop typing', handleStopTyping);

    return () => {
      socket.off('typing', handleTyping);
      socket.off('stop typing', handleStopTyping);
    };
  }, [socket, currentChannel, localUsername]);

  if (activeTypers.size === 0) return null;

  return (
    <div className="typing-indicator">
      {Array.from(activeTypers).join(', ')} yazıyor...
    </div>
  );
};

export default TypingIndicator;
