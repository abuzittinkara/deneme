import React, { useState } from 'react';

export default function CreateGroupModal({ open, onSubmit, onClose }) {
  const [name, setName] = useState('');
  const style = { display: open ? 'flex' : 'none' };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const channel = window.prompt('Metin kanalı adı:', 'general');
    if (channel && channel.trim() !== '') {
      if (onSubmit) onSubmit(trimmed, channel.trim());
      setName('');
    }
  };

  const handleOverlay = (e) => {
    if (e.target.id === 'actualGroupCreateModal' && onClose) onClose();
  };

  return (
    <div
      id="actualGroupCreateModal"
      className="modal"
      style={style}
      onClick={handleOverlay}
    >
      <div className="modal-content">
        <h2>Yeni Grup Kur</h2>
        <input
          type="text"
          id="actualGroupName"
          className="input-text"
          placeholder="Grup Adı"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="modal-buttons">
          <button
            id="actualGroupNameBtn"
            className="btn primary"
            onClick={handleSubmit}
          >
            Oluştur
          </button>
          <button
            id="closeCreateGroupModal"
            className="btn secondary"
            onClick={onClose}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
