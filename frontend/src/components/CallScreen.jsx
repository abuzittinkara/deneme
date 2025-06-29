import React, { useEffect, useState, useContext } from 'react';
import UserCard from './UserCard.jsx';
import DMChat from './DMChat.jsx';
import TextChannel from './TextChannel.jsx';
import DMPanel from './DMPanel.jsx';
import GroupOptionsModal from './GroupOptionsModal.jsx';
import CreateGroupModal from './CreateGroupModal.jsx';
import JoinGroupModal from './JoinGroupModal.jsx';
import UserList from './UserList.jsx';
import useCallScreenInit from '../useCallScreenInit.js';
import { SocketContext } from '../SocketProvider.jsx';

export default function CallScreen() {
  const socket = useContext(SocketContext);
  const [dmFriend, setDmFriend] = useState(null);
  const [groupOptionsOpen, setGroupOptionsOpen] = useState(false);
  const [dmPanelOpen, setDmPanelOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [joinGroupOpen, setJoinGroupOpen] = useState(false);
  useCallScreenInit();

  const openCreateGroup = () => {
    setCreateGroupOpen(true);
    setGroupOptionsOpen(false);
  };

  const openJoinGroup = () => {
    setJoinGroupOpen(true);
    setGroupOptionsOpen(false);
  };

  const handleCreateGroup = (name, channel) => {
    if (socket) socket.emit('createGroup', { groupName: name, channelName: channel });
    setCreateGroupOpen(false);
  };

  const handleJoinGroup = (gid) => {
    if (socket) socket.emit('joinGroup', gid);
    setJoinGroupOpen(false);
  };
  useEffect(() => {
    window.openDMChat = setDmFriend;
    return () => {
      if (window.openDMChat === setDmFriend) delete window.openDMChat;
    };
  }, []);
  return (
    <div id="callScreen" className="screen-container">
      <GroupOptionsModal
        open={groupOptionsOpen}
        onCreateGroup={openCreateGroup}
        onJoinGroup={openJoinGroup}
        onClose={() => setGroupOptionsOpen(false)}
      />
      <CreateGroupModal
        open={createGroupOpen}
        onSubmit={handleCreateGroup}
        onClose={() => setCreateGroupOpen(false)}
      />
      <JoinGroupModal
        open={joinGroupOpen}
        onSubmit={handleJoinGroup}
        onClose={() => setJoinGroupOpen(false)}
      />
      {dmPanelOpen && <DMPanel />}
      {/* Soldaki Paneller */}
      <div id="leftPanels" className="left-panels">
        <div id="groupsAndRooms" className="groups-rooms">
          {/* Sidebar (Gruplar) */}
          <div className="sidebar" id="sidebar">
            <button
              id="toggleDMButton"
              className="circle-btn dm-toggle-btn"
              onClick={() => setDmPanelOpen((o) => !o)}
            >
              <span className="material-icons">forum</span>
            </button>
            <div id="groupList" className="group-list"></div>
            <button
              id="createGroupButton"
              className="circle-btn create-group-btn"
              onClick={() => setGroupOptionsOpen(true)}
            >
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
          <UserCard />
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
        {/* DMChat React component */}
        <DMChat friend={dmFriend} />
        <div id="channelContentArea" className="channel-content-area">
          {/* Voice kanallar için */}
          <div id="channelUsersContainer" className="channel-users-container" style={{ display: 'none' }}></div>
          {/* Text kanalı React bileşeni */}
          <TextChannel />
        </div>
      </div>
      {/* Sağ Panel (Kullanıcılar) */}
      <div className="right-panel" id="rightPanel">
        <UserList />
      </div>
    </div>
  );
}
