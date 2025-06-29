import React from 'react';

export default function EditPhoneModal() {
  return (
    <div id="editPhoneModal" className="modal">
      <div className="modal-content">
        <span className="material-icons close-modal">close</span>
        <h2>Telefon Numarası Düzenle</h2>
        <p>Yeni telefon numaranızı girin.</p>
        <input type="tel" id="editPhoneInput" className="input-text" placeholder="Telefon Numarası" />
        <p id="editPhoneError" className="modal-error" style={{ display: 'none', color: 'var(--accent-danger)', fontSize: '0.9rem', margin: '0.3rem 0' }}></p>
        <div className="modal-buttons">
          <button className="btn primary">Gönder</button>
          <button className="btn secondary">İptal</button>
        </div>
      </div>
    </div>
  );
}
