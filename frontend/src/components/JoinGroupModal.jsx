import React, { useState } from 'react';

export default function JoinGroupModal({ open, onSubmit, onClose }) {
  const [groupId, setGroupId] = useState('');
  const style = { display: open ? 'flex' : 'none' };

  const handleSubmit = () => {
    const gid = groupId.trim();
    if (!gid) return;
    if (onSubmit) onSubmit(gid);
    setGroupId('');
  };

  const handleOverlay = (e) => {
    if (e.target.id === 'joinGroupModal' && onClose) onClose();
  };

  return (
    <div id="joinGroupModal" className="modal" style={style} onClick={handleOverlay}>
      <div className="modal-content">
        <h2>Gruba Katıl</h2>
        <input
          type="text"
          id="joinGroupIdInput"
          className="input-text"
          placeholder="Grup ID"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        />
        <div className="modal-buttons">
          <button id="joinGroupIdBtn" className="btn primary" onClick={handleSubmit}>
            Gruba Katıl
          </button>
          <button id="closeJoinGroupModal" className="btn secondary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
