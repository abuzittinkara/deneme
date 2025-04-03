import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { SocketProvider } from './content/SocketContext';

ReactDOM.render(
  <React.StrictMode>
    <SocketProvider>
      <App />
    </SocketProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
