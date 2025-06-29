import React from 'react';

export default function GroupOptionsModal({ open, onCreateGroup, onJoinGroup, onClose }) {
  const style = { display: open ? 'flex' : 'none' };
  return (
    <div id="groupModal" className="modal" style={style} onClick={(e) => { if (e.target.id === 'groupModal' && onClose) onClose(); }}>
      <div className="modal-content">
        <h2>Grup Seçenekleri</h2>
        <button id="modalGroupCreateBtn" className="btn primary" onClick={onCreateGroup}>
          Grup Kur
        </button>
        <button id="modalGroupJoinBtn" className="btn secondary" onClick={onJoinGroup}>
          Gruba Katıl
        </button>
      </div>
    </div>
  );
}
