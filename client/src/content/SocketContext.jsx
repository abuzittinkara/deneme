import React, { createContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Mevcut origin üzerinden socket bağlantısı kuruyoruz.
    const newSocket = io();
    newSocket.on('connect_error', (err) => {
      console.error("Socket connect_error: ", err);
    });
    newSocket.on('connect_timeout', () => {
      console.error("Socket connect_timeout");
    });
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
