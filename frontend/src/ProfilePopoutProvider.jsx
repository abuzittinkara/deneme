import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ProfilePopout from './components/ProfilePopout.jsx';

export const ProfilePopoutContext = createContext({
  openPopout: () => {},
  closePopout: () => {}
});

export function ProfilePopoutProvider({ children }) {
  const [info, setInfo] = useState(null);

  const openPopout = useCallback((username, event) => {
    const x = event?.clientX || 0;
    const y = event?.clientY || 0;
    setInfo({ username, x, y });
  }, []);

  const closePopout = useCallback(() => setInfo(null), []);

  return (
    <ProfilePopoutContext.Provider value={{ openPopout, closePopout }}>
      {children}
      {info && createPortal(
        <ProfilePopout
          username={info.username}
          anchorX={info.x}
          anchorY={info.y}
          onClose={closePopout}
        />,
        document.body
      )}
    </ProfilePopoutContext.Provider>
  );
}

export function useProfilePopout() {
  return useContext(ProfilePopoutContext);
}
