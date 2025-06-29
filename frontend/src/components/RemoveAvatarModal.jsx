import React from 'react';

export default function RemoveAvatarModal() {
  return (
    <div id="removeAvatarModal" className="modal">
      <div className="modal-content">
        <span className="material-icons close-modal">close</span>
        <h2>Avatarı Kaldır</h2>
        <p>Profil fotoğrafınızı kaldırmak istediğinize emin misiniz?</p>
        <div className="modal-buttons">
          <button className="btn primary">Kaldır</button>
          <button className="btn secondary">İptal</button>
        </div>
      </div>
    </div>
  );
}
