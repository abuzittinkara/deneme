import React, { useContext, useEffect, useState } from 'react';
import { SocketContext } from '../SocketProvider.jsx';
import { showProfilePopout } from '../../../public/js/profilePopout.js';

function UserItem({ username }) {
  const socket = useContext(SocketContext);
  const [avatar, setAvatar] = useState('/images/default-avatar.png');

  useEffect(() => {
    let active = true;
    if (window.loadAvatar) {
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

  const openPopout = (e) => {
    e.stopPropagation();
    showProfilePopout(username, e);
  };

  return (
    <div className="user-item">
      <img
        className="user-profile-pic"
        data-username={username}
        src={avatar}
        alt=""
        onClick={openPopout}
      />
      <span className="user-name" onClick={openPopout}>{username}</span>
    </div>
  );
}

export default function UserList() {
  const socket = useContext(SocketContext);
  const [online, setOnline] = useState([]);
  const [offline, setOffline] = useState([]);

  useEffect(() => {
    if (!socket) return;
    const handleUsers = (data) => {
      setOnline(Array.isArray(data.online) ? data.online.map(u => u.username || u) : []);
      setOffline(Array.isArray(data.offline) ? data.offline.map(u => u.username || u) : []);
    };
    socket.on('groupUsers', handleUsers);
    return () => {
      socket.off('groupUsers', handleUsers);
    };
  }, [socket]);

  return (
    <div id="userList" className="user-list">
      <div style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Çevrimiçi</div>
      {online.length > 0 ? (
        online.map((u) => <UserItem key={u} username={u} />)
      ) : (
        <p style={{ fontSize: '0.75rem' }}>(Kimse yok)</p>
      )}
      <div style={{ fontWeight: 'normal', fontSize: '0.85rem', marginTop: '1rem' }}>Çevrimdışı</div>
      {offline.length > 0 ? (
        offline.map((u) => <UserItem key={u} username={u} />)
      ) : (
        <p style={{ fontSize: '0.75rem' }}>(Kimse yok)</p>
      )}
    </div>
  );
}
