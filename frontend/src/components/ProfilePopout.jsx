import React, { useContext, useEffect, useState } from 'react';
import { SocketContext } from '../SocketProvider.jsx';

export default function ProfilePopout({ username, anchorX = 0, anchorY = 0, onClose }) {
  const socket = useContext(SocketContext);
  const [avatar, setAvatar] = useState('/images/default-avatar.png');
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    if (window.loadAvatar) {
      window.loadAvatar(username).then((url) => {
        if (active && url) setAvatar(url);
      });
    }
    const token = window.getAuthToken ? window.getAuthToken() : null;
    fetch(`/api/user/profile?username=${encodeURIComponent(username)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (active) setData(d);
      });
    const handle = ({ username: u, avatar }) => {
      if (u === username) setAvatar(avatar || '/images/default-avatar.png');
    };
    if (socket) socket.on('avatarUpdated', handle);

    const esc = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    const docClick = (e) => {
      if (!e.target.closest('.profile-popout')) {
        onClose && onClose();
      }
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('click', docClick);

    return () => {
      active = false;
      if (socket) socket.off('avatarUpdated', handle);
      document.removeEventListener('keydown', esc);
      document.removeEventListener('click', docClick);
    };
  }, [username, socket, onClose]);

  if (!data) return null;

  const style = { left: `${anchorX}px`, top: `${anchorY}px` };

  return (
    <div className="profile-popout" style={style} onClick={(e) => e.stopPropagation()}>
      <div className="popout-banner"></div>
      <div className="popout-avatar-wrap">
        <img className="popout-avatar" src={avatar} alt="" />
        <span className="status-dot"></span>
      </div>
      <div className="popout-display-name">{data.displayName || username}</div>
      {Array.isArray(data.badges) && data.badges.length > 0 && (
        <div className="popout-badges">
          {data.badges.map((b) => (
            <span key={b} className="badge">{b}</span>
          ))}
        </div>
      )}
      {data.ctaLabel && (
        <button className="profile-cta-btn">{data.ctaLabel}</button>
      )}
    </div>
  );
}
