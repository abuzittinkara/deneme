import React, { useEffect } from 'react';

export default function CallScreen() {
  useEffect(() => {
    if (window.initCallScreen) {
      window.initCallScreen();
    }
  }, []);
  return (
    <div id="callScreen" className="screen-container">
      {/* Soldaki Paneller */}
      <div id="leftPanels" className="left-panels">
        <div id="groupsAndRooms" className="groups-rooms">
          {/* Sidebar (Gruplar) */}
          <div className="sidebar" id="sidebar">
            <button id="toggleDMButton" className="circle-btn dm-toggle-btn">
              <span className="material-icons">forum</span>
            </button>
            <div id="groupList" className="group-list"></div>
            <button id="createGroupButton" className="circle-btn create-group-btn">
              <span className="material-icons">add</span>
            </button>
          </div>
          {/* Odalar Paneli */}
          <div id="roomPanel" className="rooms-panel">
            <div className="room-panel-header">
              <h2 id="groupTitle" className="panel-title">Seçili Grup</h2>
              <span id="groupDropdownIcon" className="dropdown-icon material-icons">keyboard_arrow_down</span>
              <div id="groupDropdownMenu" className="dropdown-menu" style={{ display: 'none' }}>
                <div className="dropdown-item" id="copyGroupIdBtn">Grup ID Kopyala</div>
                <div className="dropdown-item" id="renameGroupBtn">Grup ismi değiştir</div>
                <div className="dropdown-item" id="createChannelBtn">Kanal Oluştur</div>
                <div className="dropdown-item" id="createCategoryBtn">Kategori Oluştur</div>
                <div className="dropdown-item" id="groupSettingsBtn">Grup Ayarları</div>
                <div className="dropdown-item" id="leaveGroupBtn">Bu gruptan ayrıl</div>
                <div className="dropdown-item" id="deleteGroupBtn">Grubu Sil</div>
              </div>
            </div>
            <div id="roomList" className="room-list"></div>
          </div>
        </div>
        <div id="channelStatusPanel" className="channel-status-panel">
          <div className="connection-header">
            <span className="material-icons status-icon">signal_cellular_alt</span>
            <span id="connectionStatusText" className="status-connecting">RTC Bağlanıyor</span>
            <button id="leaveButton" className="panel-btn leave-btn" title="Kanalı Terk Et">
              <span className="material-icons">call_end</span>
            </button>
          </div>
          <div className="channel-info-row">
            <span id="panelGroupName" className="group-name"></span>
            <span className="name-separator">/</span>
            <span id="panelChannelName" className="channel-name"></span>
            <div id="signalBars" className="signal-bars">
              <div className="cell-bar" id="cellBar1"></div>
              <div className="cell-bar" id="cellBar2"></div>
              <div className="cell-bar" id="cellBar3"></div>
              <div className="cell-bar" id="cellBar4"></div>
            </div>
            <span id="pingValue" className="ping-value"></span>
          </div>
          <div className="button-row">
            <button id="cameraShareButton" className="panel-btn" title="Kamera Paylaşımı">
              <span className="material-icons">videocam</span>
            </button>
            <button id="screenShareLargeButton" className="panel-btn" title="Ekran Paylaş">
              <span className="material-icons">desktop_windows</span>
            </button>
            <button id="soundbarButton" className="panel-btn" title="Ses Paneli">
              <span className="material-icons">graphic_eq</span>
            </button>
          </div>
          <div className="panel-divider"></div>
          <div className="user-card">
            <div className="user-avatar" id="userCardAvatar"></div>
            <div className="user-info">
              <span id="userCardName" className="user-name">(Kullanıcı)</span>
              <span id="userCardStatus" className="user-status">Çevrimdışı</span>
            </div>
            <button id="micToggleButton" className="icon-btn" title="Mikrofon Aç/Kapa"></button>
            <button id="deafenToggleButton" className="icon-btn" title="Kendini Sağırlaştır"></button>
            <button id="settingsButton" className="icon-btn" title="Ayarlar">
              <span className="material-icons">settings</span>
            </button>
          </div>
        </div>
      </div>
      {/* Ortadaki Ana İçerik */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Seçili Kanal Barı (kanal moduna özel) */}
        <div id="selectedChannelBar" className="selected-channel-bar">
          <h2 id="selectedChannelTitle" className="selected-channel-title">Kanal Seçilmedi</h2>
          <span id="toggleUserListButton" className="material-icons userlist-toggle">groups</span>
        </div>
        {/* Seçili DM Barı (DM moduna özel) */}
        <div id="selectedDMBar" className="selected-channel-bar" style={{ display: 'none' }}>
          {/* dmChannelTitle doğrudan selectedDMBar içinde yer alır, sol hizalı */}
          <h2 id="dmChannelTitle" className="dm-channel-title">
            <span className="dm-title-text">Arkadaşlar</span>
            <span className="dm-divider"></span>
            <span className="dm-filter-item" data-filter="online">Çevrimiçi</span>
            <span className="dm-filter-item" data-filter="all">Hepsi</span>
            <span className="dm-filter-item" data-filter="sent">Beklemede</span>
            <span className="dm-filter-item" data-filter="blocked">Engellenen</span>
            <span className="dm-filter-item" data-filter="add">Arkadaş ekle</span>
          </h2>
        </div>
        {/* dmContentArea, selectedDMBar'dan hemen sonra, main-content'in geri kalanını dolduracak şekilde konumlandırılmıştır */}
        <div id="dmContentArea" style={{ display: 'none', flex: 1, overflow: 'auto' }}>
          {/* DM içerikleri buraya gelecek */}
        </div>
        <div id="channelContentArea" className="channel-content-area">
          {/* Voice kanallar için */}
          <div id="channelUsersContainer" className="channel-users-container" style={{ display: 'none' }}></div>
          {/* Text kanallar için: mesajların listeleneceği alan + mesaj yazma kutusu */}
          <div id="textChannelContainer" className="text-channel-container" style={{ display: 'none' }}>
            <div id="textMessages" className="text-messages">
              {/* Örnek mesaj öğeleri (HTML üretiminiz dinamik olsa bile örnek olarak eklenmiştir) */}
              <div className="text-message first-message" data-timestamp="2025-02-24T14:47:08.391Z" data-sender="abuzorttin">
                <div className="message-item" style={{ position: 'relative' }}>
                  <span className="hover-time">14:47</span>
                  <div className="message-content first-message">Merhaba, bu ilk mesaj.</div>
                </div>
              </div>
              <div className="text-message middle-message" data-timestamp="2025-02-24T14:47:12.000Z" data-sender="abuzorttin">
                <div className="message-item" style={{ position: 'relative' }}>
                  <span className="hover-time">14:47</span>
                  <div className="message-content middle-message">Devam eden mesaj.</div>
                </div>
              </div>
              <div className="text-message last-message" data-timestamp="2025-02-24T14:47:16.000Z" data-sender="abuzorttin">
                <div className="message-item" style={{ position: 'relative' }}>
                  <span className="hover-time">14:47</span>
                  <div className="message-content last-message">Son mesaj.</div>
                </div>
              </div>
            </div>
            <div id="textChatInputBar" className="text-chat-input-bar">
              <div className="chat-input-wrapper">
                <button id="attachBtn" className="icon-btn" type="button">
                  <span className="material-icons">add</span>
                </button>
                <input id="attachFileInput" type="file" multiple hidden />
                <input id="attachMediaInput" type="file" accept="image/*,video/*" multiple hidden />
                <input id="attachAudioInput" type="file" accept="audio/*" multiple hidden />
                <input id="attachGifInput" type="file" accept="image/gif" multiple hidden />
                <div id="textChannelMessageInput" className="chat-input" contentEditable="true" data-placeholder="Bir mesaj yazın..."></div>
                <span id="micMessageBtn" className="material-icons mic-icon">mic</span>
                <span id="sendTextMessageBtn" className="material-icons send-icon">send</span>
              </div>
              <div id="attachmentPreview" className="attachment-preview" style={{ display: 'none' }}></div>
            </div>
            <div id="previewWrapper" className="preview-wrapper" style={{ display: 'none' }}>
              <div className="preview-toolbar">
                <span className="toolbar-icon close-icon material-icons">close</span>
                <span className="toolbar-icon edit-icon material-icons">edit</span>
                <span className="toolbar-icon download-icon material-icons">download</span>
              </div>
              <div className="main-media"></div>
              <div className="thumbnail-tray"></div>
              <input type="text" className="caption-input" placeholder="Add a caption..." />
            </div>
          </div>
        </div>
      </div>
      {/* Sağ Panel (Kullanıcılar) */}
      <div className="right-panel" id="rightPanel">
        <div id="userList" className="user-list"></div>
      </div>
    </div>
  );
}
