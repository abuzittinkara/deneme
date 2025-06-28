import React, { createContext, useState } from 'react';
import { io } from 'socket.io-client';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket] = useState(() => {
    if (typeof window === 'undefined') return null;
    if (window.socket) return window.socket;
    const socketURL = window.SOCKET_URL || window.location.origin;
    const s = io(socketURL, { transports: ['websocket'] });
    window.socket = s;
    return s;
  });

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}
