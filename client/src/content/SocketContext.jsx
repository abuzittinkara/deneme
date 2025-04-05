import React, { createContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const newSocket = io();
    newSocket.on('connect', () => {
      console.log("Socket connected", newSocket.id);
      setSocket(newSocket);
      setLoading(false);
    });
    newSocket.on('connect_error', (err) => {
      console.error("Socket connect_error: ", err);
    });
    newSocket.on('connect_timeout', () => {
      console.error("Socket connect_timeout");
    });
    return () => newSocket.close();
  }, []);

  if (loading) {
    return <div>Bağlanıyor...</div>;
  }

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
