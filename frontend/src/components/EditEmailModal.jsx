import React from 'react';

export default function EditEmailModal() {
  return (
    <div id="editEmailModal" className="modal">
      <div className="modal-content">
        <span className="material-icons close-modal">close</span>
        <h2>E-Posta Düzenle</h2>
        <p>Yeni e-posta adresinizi girin.</p>
        <input type="email" id="editEmailInput" className="input-text" placeholder="E-Posta" />
        <p id="editEmailError" className="modal-error" style={{ display: 'none', color: 'var(--accent-danger)', fontSize: '0.9rem', margin: '0.3rem 0' }}></p>
        <div className="modal-buttons">
          <button className="btn primary">Gönder</button>
          <button className="btn secondary">İptal</button>
        </div>
      </div>
    </div>
  );
}
