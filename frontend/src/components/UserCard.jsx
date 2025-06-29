import React, { useContext, useEffect, useState } from 'react';
import { UserContext } from '../UserContext.jsx';

export default function UserCard() {
  const { username } = useContext(UserContext);
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    let mounted = true;
    if (username && window.loadAvatar) {
      window.loadAvatar(username).then((url) => {
        if (mounted) setAvatar(url);
      });
    }
    return () => {
      mounted = false;
    };
  }, [username]);

  const avatarStyle = avatar ? { backgroundImage: `url(${avatar})` } : {};

  return (
    <div className="user-card">
      <div
        className="user-avatar"
        id="userCardAvatar"
        style={avatarStyle}
        data-username={username || undefined}
      ></div>
      <div className="user-info">
        <span id="userCardName" className="user-name">
          {username || '(Kullanıcı)'}
        </span>
        <span id="userCardStatus" className="user-status">Çevrimdışı</span>
      </div>
      <button id="micToggleButton" className="icon-btn" title="Mikrofon Aç/Kapa"></button>
      <button id="deafenToggleButton" className="icon-btn" title="Kendini Sağırlaştır"></button>
      <button id="settingsButton" className="icon-btn" title="Ayarlar">
        <span className="material-icons">settings</span>
      </button>
    </div>
  );
}
