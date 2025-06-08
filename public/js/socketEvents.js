import * as UserList from './userList.js';
import * as WebRTC from './webrtc.js';
import { startVolumeAnalysis } from './audioUtils.js';
import * as Ping from './ping.js';

// Holds latest channel data so that we can re-render user lists when needed
window.latestChannelsData = null;

function refreshVisibilityIcons() {
  const rows = document.querySelectorAll('.channel-user');
  rows.forEach((row) => {
    const leftDiv = row.querySelector('.channel-user-left');
    if (!leftDiv) return;
    const nameSpan = leftDiv.querySelector('span');
    if (!nameSpan) return;
    const username = nameSpan.textContent;
    const existing = leftDiv.querySelector('.visibility-icon');
    if (
      Array.isArray(window.screenShareWatchers) &&
      window.screenShareWatchers.includes(username)
    ) {
      if (!existing) {
        const visIcon = document.createElement('span');
        visIcon.classList.add('material-icons', 'visibility-icon');
        visIcon.textContent = 'visibility';
        leftDiv.appendChild(visIcon);
      }
    } else if (existing) {
      existing.remove();
    }
  });
}

export function initSocketEvents(socket) {
  const {
    loginScreen,
    callScreen,
    loginErrorMessage,
    loginUsernameInput,
    loginPasswordInput,
    registerScreen,
    registerErrorMessage,
    groupListDiv,
    groupTitle,
    deleteGroupBtn,
    renameGroupBtn,
    groupSettingsBtn,
    leaveGroupBtn,
    roomListDiv,
    selectedChannelTitle,
    textChannelContainer,
  } = window;

  function renderChannelUsers(channelsObj) {
    if (!channelsObj) return;
    Object.keys(channelsObj).forEach((roomId) => {
      const cData = channelsObj[roomId];
      const channelDiv = document.getElementById(`channel-users-${roomId}`);
      if (!channelDiv) return;
      channelDiv.innerHTML = '';
      cData.users.forEach((u) => {
        const userRow = document.createElement('div');
        userRow.classList.add('channel-user');
        const leftDiv = document.createElement('div');
        leftDiv.classList.add('channel-user-left');
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('channel-user-avatar');
        avatarDiv.id = `avatar-${u.id}`;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = u.username || '(İsimsiz)';
        leftDiv.appendChild(avatarDiv);
        leftDiv.appendChild(nameSpan);
        if (
          socket.id &&
          Array.isArray(window.screenShareWatchers) &&
          window.screenShareWatchers.includes(u.username)
        ) {
          const visIcon = document.createElement('span');
          visIcon.classList.add('material-icons', 'visibility-icon');
          visIcon.textContent = 'visibility';
          leftDiv.appendChild(visIcon);
        }
        const rightDiv = document.createElement('div');
        rightDiv.classList.add('channel-user-right');
        if (u.hasMic === false) {
          const micIcon = document.createElement('span');
          micIcon.classList.add('material-icons', 'mic-missing');
          micIcon.textContent = 'mic_off';
          rightDiv.appendChild(micIcon);
        } else if (u.micEnabled === false) {
          const micIcon = document.createElement('span');
          micIcon.classList.add('material-icons');
          micIcon.textContent = 'mic_off';
          rightDiv.appendChild(micIcon);
        }
        if (u.selfDeafened === true) {
          const deafIcon = document.createElement('span');
          deafIcon.classList.add('material-icons');
          deafIcon.textContent = 'headset_off';
          rightDiv.appendChild(deafIcon);
        }
        if (u.isScreenSharing === true) {
          const screenIndicator = document.createElement('span');
          screenIndicator.classList.add('screen-share-indicator');
          screenIndicator.textContent = 'YAYINDA';
          if (u.screenShareProducerId) {
            screenIndicator.style.cursor = 'pointer';
            screenIndicator.addEventListener('click', () => {
              window.clearScreenShareUI();
              WebRTC.showScreenShare(
                socket,
                window.currentGroup,
                window.currentRoom,
                u.screenShareProducerId,
                window.clearScreenShareUI,
              );
            });
          }
          rightDiv.appendChild(screenIndicator);
        }
        userRow.appendChild(leftDiv);
        userRow.appendChild(rightDiv);
        channelDiv.appendChild(userRow);
      });
    });
  }
  socket.on('connect', () => {
    console.log('Socket connected =>', socket.id);
  });
  socket.on('disconnect', () => {
    console.log('Socket disconnect');
  });
  socket.on('loginResult', (data) => {
    if (data.success) {
      window.username = data.username;
      loginScreen.style.display = 'none';
      callScreen.style.display = 'flex';
      socket.emit('set-username', window.username);
      document.getElementById('userCardName').textContent = window.username;
      window.applyAudioStates();
    } else {
      loginErrorMessage.textContent = 'Lütfen girdiğiniz bilgileri kontrol edip tekrar deneyin';
      loginErrorMessage.style.display = 'block';
      loginUsernameInput.classList.add('shake');
      loginPasswordInput.classList.add('shake');
    }
  });
  socket.on('registerResult', (data) => {
    if (data.success) {
      alert('Hesap başarıyla oluşturuldu');
      registerScreen.style.display = 'none';
      loginScreen.style.display = 'block';
    } else {
      registerErrorMessage.textContent = data.message || 'Kayıt hatası';
      registerErrorMessage.style.display = 'block';
    }
  });
  socket.on('groupUsers', (data) => {
    UserList.updateUserList(data);
  });
  socket.on('groupsList', (groupArray) => {
    groupListDiv.innerHTML = '';
    groupArray.forEach((groupObj) => {
      const grpItem = document.createElement('div');
      grpItem.className = 'grp-item';
      grpItem.setAttribute('data-group-id', groupObj.id);
      grpItem.innerText = groupObj.name[0].toUpperCase();
      grpItem.title = groupObj.name + ' (' + groupObj.id + ')';
      if (groupObj.id === window.selectedGroup) {
        grpItem.classList.add('selected');
      }
      grpItem.addEventListener('click', () => {
        document.querySelectorAll('.grp-item').forEach((el) => el.classList.remove('selected'));
        grpItem.classList.add('selected');
        window.selectedGroup = groupObj.id;
        groupTitle.textContent = groupObj.name;
        socket.emit('joinGroup', groupObj.id);
        if (typeof window.removeScreenShareEndedMessage === 'function') {
          window.removeScreenShareEndedMessage();
        }
        if (groupObj.owner === window.username) {
          deleteGroupBtn.style.display = 'block';
          renameGroupBtn.style.display = 'block';
        } else {
          deleteGroupBtn.style.display = 'none';
          renameGroupBtn.style.display = 'none';
        }

        if (groupSettingsBtn) {
          groupSettingsBtn.style.display =
            groupObj.owner === window.username ? 'block' : 'none';
        }

        if (leaveGroupBtn) {
          leaveGroupBtn.style.display =
            groupObj.owner === window.username ? 'none' : 'block';
        }
      });
      groupListDiv.appendChild(grpItem);
    });
    if (window.selectedGroup && !groupArray.some((g) => g.id === window.selectedGroup)) {
      window.selectedGroup = null;
      window.currentGroup = null;
      window.currentRoom = null;
      window.currentTextChannel = null;
      window.currentRoomType = null;
      groupTitle.textContent = 'Seçili Grup';
      selectedChannelTitle.textContent = 'Kanal Seçilmedi';
      roomListDiv.innerHTML = '';
      if (typeof window.hideVoiceSections === 'function') window.hideVoiceSections();
      if (textChannelContainer) textChannelContainer.style.display = 'none';
      const container = document.getElementById('channelUsersContainer');
      if (container) {
        container.innerHTML = '';
        container.classList.remove(
          'layout-1-user',
          'layout-2-users',
          'layout-3-users',
          'layout-4-users',
          'layout-n-users',
        );
      }
    }
  });
  socket.on('groupDeleted', ({ groupId }) => {
    const grpItems = document.querySelectorAll('.grp-item');
    grpItems.forEach((item) => {
      if (item.getAttribute('data-group-id') === groupId) {
        item.remove();
      }
    });
    if (window.selectedGroup === groupId) {
      window.selectedGroup = null;
      groupTitle.textContent = 'Seçili Grup';
    }
  });

  function buildChannelItem(roomObj) {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';
    roomItem.dataset.roomId = roomObj.id;
    const channelHeader = document.createElement('div');
    channelHeader.className = 'channel-header';
    let icon;
    if (roomObj.type === 'voice') {
      icon = document.createElement('span');
      icon.classList.add('material-icons', 'channel-icon');
      icon.textContent = 'volume_up';
    } else {
      icon = document.createElement('span');
      icon.classList.add('material-icons', 'channel-icon');
      icon.textContent = 'chat';
    }
    const textSpan = document.createElement('span');
    textSpan.textContent = roomObj.name;
    channelHeader.appendChild(icon);
    channelHeader.appendChild(textSpan);
    const channelUsers = document.createElement('div');
    channelUsers.className = 'channel-users';
    channelUsers.id = `channel-users-${roomObj.id}`;
    roomItem.appendChild(channelHeader);
    roomItem.appendChild(channelUsers);

    roomItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.showChannelContextMenu(e, roomObj);
    });

    roomItem.addEventListener('click', () => {
      if (roomObj.type === 'text') {
        selectedChannelTitle.textContent = roomObj.name;
        textChannelContainer.style.display = 'flex';
        textChannelContainer.style.flexDirection = 'column';
        document.getElementById('channelUsersContainer').style.display = 'none';
        if (!(window.currentRoom && window.currentRoomType === 'voice')) {
          window.hideVoiceSections();
          window.currentRoomType = 'text';
        }
        window.textMessages.innerHTML = '';
        window.currentTextChannel = roomObj.id;
        window.textMessages.dataset.channelId = roomObj.id;
        socket.emit('joinTextChannel', { groupId: window.selectedGroup, roomId: roomObj.id });
        if (typeof window.removeScreenShareEndedMessage === 'function') {
          window.removeScreenShareEndedMessage();
        }
        return;
      }
      window.clearScreenShareUI();
      document.getElementById('channelUsersContainer').style.display = 'flex';
      document.querySelectorAll('.channel-item').forEach((ci) => ci.classList.remove('connected'));
      if (window.currentRoom === roomObj.id && window.currentGroup === window.selectedGroup) {
        roomItem.classList.add('connected');
        window.updateVoiceChannelUI(roomObj.name);
        return;
      }
      if (window.currentRoom && (window.currentRoom !== roomObj.id || window.currentGroup !== window.selectedGroup)) {
        window.leaveRoomInternal(socket);
      }
      window.currentGroup = window.selectedGroup;
        WebRTC.requestMicrophoneAccess(socket, window.applyAudioStates, { value: window.hasMic }).finally(() => {
          const currentGroupName = groupTitle ? groupTitle.textContent : '';
          window.joinRoom(
            socket,
            window.currentGroup,
            roomObj.id,
            roomObj.name,
            currentGroupName,
            selectedChannelTitle,
            window.showChannelStatusPanel,
            { value: window.currentRoomType },
          );
        });
      roomItem.classList.add('connected');
    });

    return roomItem;
  }

  socket.on('channelRenamed', ({ channelId, newName }) => {
    const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
    if (item) {
      const header = item.querySelector('.channel-header');
      if (header && header.lastElementChild) {
        header.lastElementChild.textContent = newName;
      }
    }
  });

  socket.on('channelDeleted', ({ channelId }) => {
    const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
    if (item) {
      item.remove();
    }
  });
  socket.on('roomsList', (roomsArray) => {
    roomListDiv.innerHTML = '';
    roomsArray.forEach((roomObj) => {
      const roomItem = buildChannelItem(roomObj);
      roomListDiv.appendChild(roomItem);
    });
  });
  socket.on('joinRoomAck', ({ groupId, roomId }) => {
    window.currentGroup = groupId;
    window.currentRoom = roomId;
    window.currentRoomType = 'voice';
    if (typeof window.showChannelStatusPanel === 'function') {
      window.showChannelStatusPanel();
    }
    if (!WebRTC.audioPermissionGranted || !WebRTC.localStream) {
      WebRTC.requestMicrophoneAccess(socket, window.applyAudioStates, { value: window.hasMic }).finally(() => {
        WebRTC.startSfuFlow(socket, window.currentGroup, window.currentRoom);
      });
    } else {
      WebRTC.startSfuFlow(socket, window.currentGroup, window.currentRoom);
    }
  });
  socket.on('newProducer', ({ producerId }) => {
    if (!WebRTC.recvTransport) return;
    WebRTC.consumeProducer(socket, window.currentGroup, window.currentRoom, producerId);
  });
  socket.on('screenShareEnded', ({ userId, username }) => {
    if (typeof window.clearScreenShareUI === 'function') {
      window.clearScreenShareUI();
    }
    const channelContentArea = document.querySelector('.channel-content-area');
    if (
      WebRTC.screenShareContainer &&
      channelContentArea &&
      channelContentArea.contains(WebRTC.screenShareContainer)
    ) {
      channelContentArea.removeChild(WebRTC.screenShareContainer);
    } else if (
      WebRTC.screenShareVideo &&
      channelContentArea &&
      channelContentArea.contains(WebRTC.screenShareVideo)
    ) {
      channelContentArea.removeChild(WebRTC.screenShareContainer);
    }
    if (
      window.screenShareVideo &&
      window.screenShareVideo.dataset.peerId === userId
    ) {
      socket.emit('stopWatching', { userId });
    }
    window.screenShareVideo = null;
    window.screenShareContainer = null;
    const message =
      userId === socket.id
        ? 'Yayınınız sonlandırıldı'
        : `${username || 'Bir kullanıcı'} adlı kullanıcının yayını sonlandırıldı`;
    window.displayScreenShareEndedMessage(message);
  });
  socket.on('screenShareWatchers', (watchers) => {
    window.screenShareWatchers = watchers;
    if (window.latestChannelsData) {
      renderChannelUsers(window.latestChannelsData);
    }
  });
  socket.on('allChannelsData', (channelsObj) => {
    window.latestChannelsData = channelsObj;
    renderChannelUsers(channelsObj);
  });
}