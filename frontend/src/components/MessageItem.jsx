import React, { useEffect, useState, useContext } from 'react';
import { SocketContext } from '../SocketProvider.jsx';

export default function MessageItem({ msg, time }) {
  const socket = useContext(SocketContext);
  const username = msg.username || (msg.user && msg.user.username) || '';
  const [avatar, setAvatar] = useState('/images/default-avatar.png');

  useEffect(() => {
    let active = true;
    if (username && window.loadAvatar) {
      window.loadAvatar(username).then((url) => {
        if (active && url) setAvatar(url);
      });
    }
    const handle = ({ username: u, avatar: av }) => {
      if (u === username) setAvatar(av || '/images/default-avatar.png');
    };
    if (socket) socket.on('avatarUpdated', handle);
    return () => {
      active = false;
      if (socket) socket.off('avatarUpdated', handle);
    };
  }, [username, socket]);

  const avatarStyle = { backgroundImage: `url(${avatar})` };

  return (
    <div className="text-message">
      <div className="message-item" style={{ position: 'relative' }}>
        <div className="message-avatar-container">
          <div className="message-avatar" style={avatarStyle}></div>
        </div>
        <div className="sender-info">
          <span className="sender-name">{username}</span>
          {time && <span className="timestamp">{time}</span>}
        </div>
        <div className="message-content">{msg.content}</div>
        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
          <div className="message-attachments">
            {msg.attachments.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                {a.name || a.url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
