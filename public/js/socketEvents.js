import * as UserList from './userList.js';
import * as WebRTC from './webrtc.js';
import { startVolumeAnalysis } from './audioUtils.js';
import * as Ping from './ping.js';

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
    roomListDiv,
    selectedChannelTitle,
    textChannelContainer,
  } = window;
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
      document.getElementById('leftUserName').textContent = window.username;
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
      });
      groupListDiv.appendChild(grpItem);
    });
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
  socket.on('roomsList', (roomsArray) => {
    roomListDiv.innerHTML = '';
    roomsArray.forEach((roomObj) => {
      const roomItem = document.createElement('div');
      roomItem.className = 'channel-item';
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
            window.hideChannelStatusPanel();
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
          window.joinRoom(socket, window.currentGroup, roomObj.id, roomObj.name, selectedChannelTitle, window.showChannelStatusPanel, { value: window.currentRoomType }, { value: window.activeVoiceChannelName });
        });
        roomItem.classList.add('connected');
      });
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
    const channelContentArea = document.querySelector('.channel-content-area');
    if (WebRTC.screenShareContainer && channelContentArea && channelContentArea.contains(WebRTC.screenShareContainer)) {
      channelContentArea.removeChild(WebRTC.screenShareContainer);
    } else if (WebRTC.screenShareVideo && channelContentArea && channelContentArea.contains(WebRTC.screenShareVideo)) {
      channelContentArea.removeChild(WebRTC.screenShareContainer);
    }
    window.screenShareVideo = null;
    window.screenShareContainer = null;
    const message = userId === socket.id
      ? 'Yayınınız sonlandırıldı'
      : `${username || 'Bir kullanıcı'} adlı kullanıcının yayını sonlandırıldı`;
    window.displayScreenShareEndedMessage(message);
  });
  socket.on('allChannelsData', (channelsObj) => {
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
              WebRTC.showScreenShare(socket, window.currentGroup, window.currentRoom, u.screenShareProducerId, window.clearScreenShareUI);
            });
          }
          rightDiv.appendChild(screenIndicator);
        }
        userRow.appendChild(leftDiv);
        userRow.appendChild(rightDiv);
        channelDiv.appendChild(userRow);
      });
    });
  });
}