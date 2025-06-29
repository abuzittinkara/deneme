import React from 'react';

export default function AvatarUploadModal() {
  return (
    <div id="avatarUploadModal" className="modal">
      <div className="modal-content">
        <span id="closeAvatarUploadModal" className="material-icons">close</span>
        <h2>Avatarı Yükle</h2>
        <input type="file" id="avatarFileInput" accept="image/*" />
        <div id="avatarCropContainer" style={{ marginTop: '1rem' }}></div>
        <div className="modal-buttons">
          <button id="saveAvatarBtn" className="btn primary">Kaydet</button>
          <button id="cancelAvatarUploadBtn" className="btn secondary">İptal</button>
        </div>
      </div>
    </div>
  );
}
