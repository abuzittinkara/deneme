import React from 'react';
import { createRoot } from 'react-dom/client';
import ProfilePopout from '../../frontend/src/components/ProfilePopout.jsx';
import { SocketContext } from '../../frontend/src/SocketProvider.jsx';

export let currentPopout = null;
let root = null;
let socketRef = null;

export function initProfilePopout(socket) {
  socketRef = socket;
}

export function showProfilePopout(username, event) {
  if (root) {
    root.unmount();
    if (currentPopout && currentPopout.parentNode) currentPopout.remove();
    currentPopout = null;
    root = null;
  }
  currentPopout = document.createElement('div');
  document.body.appendChild(currentPopout);
  const close = () => {
    if (root) {
      root.unmount();
      if (currentPopout && currentPopout.parentNode) currentPopout.remove();
      root = null;
      currentPopout = null;
    }
  };
  root = createRoot(currentPopout);
  root.render(
    React.createElement(SocketContext.Provider, { value: socketRef },
      React.createElement(ProfilePopout, {
        username,
        anchorX: event.clientX,
        anchorY: event.clientY,
        onClose: close
      })
    )
  );
}
