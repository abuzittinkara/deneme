import React, { createContext, useState } from 'react';

export const UserContext = createContext({ username: '', setUsername: () => {} });

export function UserProvider({ children }) {
  const [username, setUsername] = useState(window.username || '');

  return (
    <UserContext.Provider value={{ username, setUsername }}>
      {children}
    </UserContext.Provider>
  );
}
