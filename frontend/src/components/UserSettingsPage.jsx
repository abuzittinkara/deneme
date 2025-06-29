import React from 'react';

export default function UserSettingsPage() {
  return (
    <div id="userSettingsPage" style={{ display: 'none' }}>
      <span id="closeUserSettingsPageBtn" className="material-icons">close</span>
      <div className="settings-main-container">
        <div className="settings-filler"></div>
        <div className="settings-panel">
          <aside className="settings-sidebar">
            <input
              type="text"
              id="userSettingsSearch"
              className="input-text settings-search"
              placeholder="Ara..."
            />
            <ul className="settings-menu">
              <li className="active" data-section="account">Hesabım</li>
              <li data-section="profile">Profil</li>
              <li data-section="privacy">Veri ve Gizlilik</li>
              <li data-section="devices">Cihazlar</li>
              <li data-section="audio">Ses ve Görüntü</li>
              <li data-section="appearance">Görünüm</li>
              <li data-section="notifications">Bildirimler</li>
              <li data-section="connections">Bağlantılar</li>
              <li data-section="advanced">Gelişmiş</li>
              <li data-section="logout" className="logout-item">Çıkış Yap</li>
            </ul>
          </aside>
          <div className="settings-content"></div>
        </div>
      </div>
    </div>
  );
}
