import React from 'react';

export default function EditUsernameModal() {
  return (
    <div id="editUsernameModal" className="modal">
      <div className="modal-content">
        <span className="material-icons close-modal">close</span>
        <h2>Kullanıcı Adı Düzenle</h2>
        <p>Yeni kullanıcı adınızı girin.</p>
        <input type="text" id="editUsernameInput" className="input-text" placeholder="Kullanıcı Adı" />
        <p id="editUsernameError" className="modal-error" style={{ display: 'none', color: 'var(--accent-danger)', fontSize: '0.9rem', margin: '0.3rem 0' }}></p>
        <div className="modal-buttons">
          <button className="btn primary">Gönder</button>
          <button className="btn secondary">İptal</button>
        </div>
      </div>
    </div>
  );
}
