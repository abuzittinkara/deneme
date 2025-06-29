import React, { useEffect, useState, useContext } from 'react';
import UserCard from './UserCard.jsx';
import DMChat from './DMChat.jsx';
import TextChannel from './TextChannel.jsx';
import DMPanel from './DMPanel.jsx';
import GroupOptionsModal from './GroupOptionsModal.jsx';
import CreateGroupModal from './CreateGroupModal.jsx';
import JoinGroupModal from './JoinGroupModal.jsx';
import GroupSettingsModal from './GroupSettingsModal.jsx';
import UserSettingsPage from './UserSettingsPage.jsx';
import LogoutConfirmModal from './LogoutConfirmModal.jsx';
import RoomModal from './RoomModal.jsx';
import CategoryModal from './CategoryModal.jsx';
import EditUsernameModal from './EditUsernameModal.jsx';
import EditEmailModal from './EditEmailModal.jsx';
import EditPhoneModal from './EditPhoneModal.jsx';
import AvatarUploadModal from './AvatarUploadModal.jsx';
import RemoveAvatarModal from './RemoveAvatarModal.jsx';
import UserList from './UserList.jsx';
import { SocketContext } from '../SocketProvider.jsx';

export default function CallScreen() {
  const socket = useContext(SocketContext);
  const [dmFriend, setDmFriend] = useState(null);
  const [groupOptionsOpen, setGroupOptionsOpen] = useState(false);
  const [dmMode, setDmMode] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [joinGroupOpen, setJoinGroupOpen] = useState(false);
  const [domRefs, setDomRefs] = useState({});

  useEffect(() => {
    const refs = {
      groupListDiv: document.getElementById('groupList'),
      createGroupButton: document.getElementById('createGroupButton'),
      roomListDiv: document.getElementById('roomList'),
      groupTitle: document.getElementById('groupTitle'),
      groupDropdownIcon: document.getElementById('groupDropdownIcon'),
      groupDropdownMenu: document.getElementById('groupDropdownMenu'),
      copyGroupIdBtn: document.getElementById('copyGroupIdBtn'),
      renameGroupBtn: document.getElementById('renameGroupBtn'),
      createChannelBtn: document.getElementById('createChannelBtn'),
      deleteGroupBtn: document.getElementById('deleteGroupBtn'),
      groupSettingsBtn: document.getElementById('groupSettingsBtn'),
      leaveGroupBtn: document.getElementById('leaveGroupBtn'),
      toggleDMButton: document.getElementById('toggleDMButton'),
      roomPanel: document.getElementById('roomPanel'),
      rightPanel: document.getElementById('rightPanel'),
      userListDiv: document.getElementById('userList'),
      toggleUserListButton: document.getElementById('toggleUserListButton'),
      channelStatusPanel: document.getElementById('channelStatusPanel'),
      connectionStatusText: document.getElementById('connectionStatusText'),
      pingValueSpan: document.getElementById('pingValue'),
      cellBar1: document.getElementById('cellBar1'),
      cellBar2: document.getElementById('cellBar2'),
      cellBar3: document.getElementById('cellBar3'),
      cellBar4: document.getElementById('cellBar4'),
      leaveButton: document.getElementById('leaveButton'),
      screenShareButton: document.getElementById('screenShareButton'),
      cameraShareButton: document.getElementById('cameraShareButton'),
      screenShareLargeButton: document.getElementById('screenShareLargeButton'),
      soundbarButton: document.getElementById('soundbarButton'),
      micToggleButton: document.getElementById('micToggleButton'),
      deafenToggleButton: document.getElementById('deafenToggleButton'),
      settingsButton: document.getElementById('settingsButton'),
      textChannelContainer: document.getElementById('textChannelContainer'),
      textMessages: document.getElementById('textMessages'),
      textChatInputBar: document.getElementById('textChatInputBar'),
      textChannelMessageInput: document.getElementById('textChannelMessageInput'),
      micMessageBtn: document.getElementById('micMessageBtn'),
      sendTextMessageBtn: document.getElementById('sendTextMessageBtn'),
      selectedChannelTitle: document.getElementById('selectedChannelTitle'),
      channelContentArea: document.getElementById('channelContentArea'),
      dmContentArea: document.getElementById('dmContentArea'),
      dmPanel: document.getElementById('dmPanel'),
      groupModal: document.getElementById('groupModal'),
      modalGroupCreateBtn: document.getElementById('modalGroupCreateBtn'),
      modalGroupJoinBtn: document.getElementById('modalGroupJoinBtn'),
      actualGroupCreateModal: document.getElementById('actualGroupCreateModal'),
      actualGroupName: document.getElementById('actualGroupName'),
      actualGroupNameBtn: document.getElementById('actualGroupNameBtn'),
      closeCreateGroupModal: document.getElementById('closeCreateGroupModal'),
      joinGroupModal: document.getElementById('joinGroupModal'),
      joinGroupIdInput: document.getElementById('joinGroupIdInput'),
      joinGroupIdBtn: document.getElementById('joinGroupIdBtn'),
      closeJoinGroupModal: document.getElementById('closeJoinGroupModal'),
      groupSettingsModal: document.getElementById('groupSettingsModal'),
      closeGroupSettingsModal: document.getElementById('closeGroupSettingsModal'),
      userSettingsPage: document.getElementById('userSettingsPage'),
      closeUserSettingsPageBtn: document.getElementById('closeUserSettingsPageBtn'),
      roomModal: document.getElementById('roomModal'),
      modalRoomName: document.getElementById('modalRoomName'),
      textChannel: document.getElementById('textChannel'),
      voiceChannel: document.getElementById('voiceChannel'),
      modalCreateRoomBtn: document.getElementById('modalCreateRoomBtn'),
      modalCloseRoomBtn: document.getElementById('modalCloseRoomBtn'),
      createCategoryBtn: document.getElementById('createCategoryBtn'),
      categoryModal: document.getElementById('categoryModal'),
      modalCategoryName: document.getElementById('modalCategoryName'),
      modalCreateCategoryBtn: document.getElementById('modalCreateCategoryBtn'),
      modalCloseCategoryBtn: document.getElementById('modalCloseCategoryBtn'),
    };
    setDomRefs(refs);
    Object.assign(window, refs);
    if (typeof window.hideVoiceSections === 'function') {
      window.hideVoiceSections();
    } else if (typeof window.hideChannelStatusPanel === 'function') {
      window.hideChannelStatusPanel();
    }
    if (typeof window.initUIEvents === 'function' && socket) {
      window.initUIEvents(socket);
    }
    if (typeof window.initSocketEvents === 'function' && socket) {
      window.initSocketEvents(socket);
    }
  }, []);

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
      <GroupSettingsModal />
      <UserSettingsPage />
      <LogoutConfirmModal />
      <RoomModal />
      <CategoryModal />
      <EditUsernameModal />
      <EditEmailModal />
      <EditPhoneModal />
      <AvatarUploadModal />
      <RemoveAvatarModal />
      {dmMode && <DMPanel />}
      {/* Soldaki Paneller */}
      <div id="leftPanels" className="left-panels">
        <div id="groupsAndRooms" className="groups-rooms">
          {/* Sidebar (Gruplar) */}
          <div className="sidebar" id="sidebar">
            <button
              id="toggleDMButton"
              className="circle-btn dm-toggle-btn"
              onClick={() => setDmMode((o) => !o)}
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
        <div
          id="selectedChannelBar"
          className="selected-channel-bar"
          style={{ display: dmMode ? 'none' : 'flex' }}
        >
          <h2 id="selectedChannelTitle" className="selected-channel-title">Kanal Seçilmedi</h2>
          <span id="toggleUserListButton" className="material-icons userlist-toggle">groups</span>
        </div>
        {/* Seçili DM Barı (DM moduna özel) */}
        <div
          id="selectedDMBar"
          className="selected-channel-bar"
          style={{ display: dmMode ? 'flex' : 'none' }}
        >
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
        <DMChat friend={dmFriend} dmActive={dmMode} />
        <div
          id="channelContentArea"
          className="channel-content-area"
          style={{ display: dmMode ? 'none' : 'flex' }}
        >
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
