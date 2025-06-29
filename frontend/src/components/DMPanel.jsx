import React, { useContext, useEffect, useState } from 'react';
import { SocketContext } from '../SocketProvider.jsx';

export default function DMPanel() {
  const socket = useContext(SocketContext);
  const [filter, setFilter] = useState('all');
  const [friends, setFriends] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [pending, setPending] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!socket) return;
    let active = true;
    if (filter === 'blocked') {
      socket.emit('getBlockedFriends', {}, (res) => {
        if (active) {
          setBlocked(res && res.success && Array.isArray(res.friends) ? res.friends : []);
        }
      });
    } else if (filter === 'sent') {
      socket.emit('getPendingFriendRequests', {}, (inRes) => {
        socket.emit('getOutgoingFriendRequests', {}, (outRes) => {
          if (!active) return;
          const list = [];
          if (inRes && inRes.success && Array.isArray(inRes.requests)) {
            list.push(...inRes.requests.map((r) => ({ username: r.from })));
          }
          if (outRes && outRes.success && Array.isArray(outRes.requests)) {
            list.push(...outRes.requests.map((r) => ({ username: r.to })));
          }
          setPending(list);
        });
      });
    } else {
      socket.emit('getFriendsList', {}, (res) => {
        if (active) {
          setFriends(res && res.success && Array.isArray(res.friends) ? res.friends : []);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [socket, filter]);

  let list = [];
  if (filter === 'blocked') {
    list = blocked;
  } else if (filter === 'sent') {
    list = pending;
  } else if (filter === 'online') {
    list = friends.filter((f) => f.online);
  } else {
    list = friends;
  }

  const shown = list.filter((f) =>
    (f.username || '').toLowerCase().includes(query.toLowerCase())
  );

  const open = (u) => {
    if (window.openDMChat) window.openDMChat(u);
  };

  return (
    <div id="dmPanel" className="dm-panel">
      <div className="dm-panel-header">
        <input
          className="dm-search-input"
          placeholder="Bir konuşma bulun veya başlatın..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="dm-filters">
          <button className={filter === 'online' ? 'selected' : ''} onClick={() => setFilter('online')}>
            Çevrimiçi
          </button>
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            Hepsi
          </button>
          <button className={filter === 'sent' ? 'selected' : ''} onClick={() => setFilter('sent')}>
            Beklemede
          </button>
          <button className={filter === 'blocked' ? 'selected' : ''} onClick={() => setFilter('blocked')}>
            Engellenen
          </button>
        </div>
      </div>
      <div className="dm-list">
        {shown.map((f) => (
          <div key={f.username} className="dm-friend-item" onClick={() => open(f.username)}>
            {f.username}
          </div>
        ))}
      </div>
    </div>
  );
}
