import React, { createContext, useState, useEffect } from 'react';

export const UserContext = createContext({ username: '', setUsername: () => {} });

export function UserProvider({ children }) {
  const [username, setUsername] = useState(window.username || '');

  useEffect(() => {
    window.getUsername = () => username;
    window.username = username;
    return () => {
      if (window.getUsername) delete window.getUsername;
    };
  }, [username]);

  return (
    <UserContext.Provider value={{ username, setUsername }}>
      {children}
    </UserContext.Provider>
  );
}
