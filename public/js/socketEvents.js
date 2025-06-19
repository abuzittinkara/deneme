import * as UserList from './userList.js';
import * as WebRTC from './webrtc.js';
import { startVolumeAnalysis } from './audioUtils.js';
import * as Ping from './ping.js';

// Holds latest channel data so that we can re-render user lists when needed
window.latestChannelsData = null;

// --- Drag and Drop Helpers ---
let dragPreviewEl = null;
function showDragPreview(username) {
  dragPreviewEl = document.createElement('div');
  dragPreviewEl.classList.add('drag-preview');
  const avatar = document.createElement('div');
  avatar.classList.add('drag-preview-avatar');
  avatar.dataset.username = username;
  avatar.style.backgroundImage = 'url(/images/default-avatar.png)';
  window.loadAvatar(username).then(av => { avatar.style.backgroundImage = `url(${av})`; });
  const name = document.createElement('span');
  name.textContent = username;
  dragPreviewEl.appendChild(avatar);
  dragPreviewEl.appendChild(name);
  document.body.appendChild(dragPreviewEl);
}

function updateDragPreview(x, y) {
  if (dragPreviewEl) {
    dragPreviewEl.style.left = `${x + 10}px`;
    dragPreviewEl.style.top = `${y + 10}px`;
  }
}

function hideDragPreview() {
  if (dragPreviewEl) {
    dragPreviewEl.remove();
    dragPreviewEl = null;
  }
}

// --- Channel Dragging Helpers ---
let channelPreviewEl = null;
let channelPlaceholder = null;
let draggedChannelEl = null;

function showChannelPreview(name) {
  channelPreviewEl = document.createElement('div');
  channelPreviewEl.classList.add('channel-drag-preview');
  channelPreviewEl.textContent = name;
  document.body.appendChild(channelPreviewEl);
}

function updateChannelPreview(x, y) {
  if (channelPreviewEl) {
    channelPreviewEl.style.left = `${x + 10}px`;
    channelPreviewEl.style.top = `${y + 10}px`;
  }
}

function hideChannelPreview() {
  if (channelPreviewEl) {
    channelPreviewEl.remove();
    channelPreviewEl = null;
  }
}

function attachUserDragHandlers(el, userId, username) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', userId);
    showDragPreview(username);
  });
  el.addEventListener('dragend', (e) => {
    e.stopPropagation();
    hideDragPreview();
  });
}

function attachChannelDragHandlers(el) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    draggedChannelEl = el;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);
    const name = el.querySelector('.channel-header span')?.textContent || '';
    showChannelPreview(name);
    channelPlaceholder = document.createElement('div');
    channelPlaceholder.classList.add('channel-placeholder');
    el.parentNode.insertBefore(channelPlaceholder, el.nextSibling);
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    hideChannelPreview();
    if (channelPlaceholder) channelPlaceholder.remove();
    channelPlaceholder = null;
    el.classList.remove('dragging');
    draggedChannelEl = null;
  });
}

function setupChannelDragContainer(socket, container) {
  container.addEventListener('dragover', (e) => {
    if (!draggedChannelEl) return;
    e.preventDefault();
    const target = e.target.closest('.channel-item');
    if (!target || target === draggedChannelEl) {
      updateChannelPreview(e.clientX, e.clientY);
      return;
    }
    const rect = target.getBoundingClientRect();
    const next = e.clientY - rect.top > rect.height / 2;
    container.insertBefore(channelPlaceholder, next ? target.nextSibling : target);
    updateChannelPreview(e.clientX, e.clientY);
  });
  container.addEventListener('drop', (e) => {
    if (!draggedChannelEl || !channelPlaceholder) return;
    e.preventDefault();
    container.insertBefore(draggedChannelEl, channelPlaceholder);
    const items = Array.from(container.querySelectorAll('.channel-item'));
    const newIndex = items.indexOf(draggedChannelEl);
    hideChannelPreview();
    channelPlaceholder.remove();
    channelPlaceholder = null;
    draggedChannelEl.classList.remove('dragging');
    socket.emit('reorderChannel', {
      groupId: window.selectedGroup,
      channelId: draggedChannelEl.dataset.roomId,
      newIndex
    });
    draggedChannelEl.classList.add('snap');
    const droppedEl = draggedChannelEl;
    setTimeout(() => droppedEl.classList.remove('snap'), 150);
    draggedChannelEl = null;
  });
}

document.addEventListener('dragover', (e) => {
  updateDragPreview(e.clientX, e.clientY);
  updateChannelPreview(e.clientX, e.clientY);
});

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

  setupChannelDragContainer(socket, roomListDiv);
  
  if (UserList.initAvatarUpdates) {
    UserList.initAvatarUpdates(socket);
  }

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
        leftDiv.dataset.userId = u.id;
        leftDiv.dataset.username = u.username;
        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('channel-user-avatar');
        avatarDiv.id = `avatar-${u.id}`;
        avatarDiv.dataset.username = u.username;
        window.loadAvatar(u.username).then(av => {
          avatarDiv.style.backgroundImage = `url(${av})`;
        });
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
        attachUserDragHandlers(leftDiv, u.id, u.username);
      channelDiv.appendChild(userRow);
      });
    });
  }

  function createUserCard(u, isBroadcast = false) {
    const card = document.createElement('div');
    card.classList.add('user-card');
    card.dataset.userId = u.id;
    card.dataset.username = u.username;
    if (isBroadcast) {
      card.classList.add('broadcast-card');
    }
    const infoWrapper = document.createElement('div');
    infoWrapper.classList.add('user-card-info');
    card.appendChild(infoWrapper);
    if (u.isScreenSharing === true) {
      card.classList.add('stream-available');
    }
    
    const avatar = document.createElement('img');
    avatar.classList.add('user-avatar');
    avatar.dataset.username = u.username;
    avatar.src = '/images/default-avatar.png';
    avatar.alt = '';
    window.loadAvatar(u.username).then(av => { avatar.src = av; });
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('user-name');
    nameSpan.textContent = u.username || '(İsimsiz)';
    infoWrapper.appendChild(avatar);
    infoWrapper.appendChild(nameSpan);
    if (u.hasMic === false) {
      const micIcon = document.createElement('span');
      micIcon.classList.add('material-icons', 'mic-missing');
      micIcon.textContent = 'mic_off';
      infoWrapper.appendChild(micIcon);
    } else if (u.micEnabled === false) {
      const micIcon = document.createElement('span');
      micIcon.classList.add('material-icons');
      micIcon.textContent = 'mic_off';
      infoWrapper.appendChild(micIcon);
    }
    if (u.selfDeafened === true) {
      const deafIcon = document.createElement('span');
      deafIcon.classList.add('material-icons');
      deafIcon.textContent = 'headset_off';
      infoWrapper.appendChild(deafIcon);
    }
    if (u.isScreenSharing === true) {
      const badge = document.createElement('span');
      badge.classList.add('screen-share-indicator');
      badge.textContent = 'YAYINDA';
      card.appendChild(badge);
      if (
        u.screenShareProducerId &&
        !(
          window.screenShareVideo &&
          window.broadcastingUserId === u.id
        )
      ) {
        const watchBtn = document.createElement('button');
        watchBtn.classList.add('watch-stream-btn', 'btn', 'primary');
        watchBtn.textContent = 'Watch Stream';
        watchBtn.addEventListener('click', () => {
          window.clearScreenShareUI();
          WebRTC.showScreenShare(
            socket,
            window.currentGroup,
            window.currentRoom,
            u.screenShareProducerId,
            window.clearScreenShareUI,
          );
        });
        card.appendChild(watchBtn);
      }
    }
    attachUserDragHandlers(card, u.id, u.username);
    return card;
  }

  function renderBroadcastView(roomUsers, broadcastingUserId) {
    const container = document.getElementById('channelUsersContainer');
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('broadcast-mode');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.justifyContent = 'space-between';
    container.style.gridTemplateColumns = '';
    container.style.gridAutoRows = '';

    const broadcaster = roomUsers.find((u) => u.id === broadcastingUserId);
    const others = roomUsers.filter((u) => u.id !== broadcastingUserId);

    if (broadcaster) {
      const broadcastCard = createUserCard(broadcaster, true);
      container.appendChild(broadcastCard);

      if (
        window.screenShareContainer &&
        window.broadcastingUserId === broadcastingUserId
      ) {
        broadcastCard.appendChild(window.screenShareContainer);
      }
    }

    const row = document.createElement('div');
    row.classList.add('viewer-row');
    others.forEach((u) => {
      row.appendChild(createUserCard(u));
    });
    container.appendChild(row);
  }

  function renderVoiceChannelGrid(roomUsers) {
    const container = document.getElementById('channelUsersContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(roomUsers)) return;

    if (window.screenShareVideo && window.broadcastingUserId) {
      renderBroadcastView(roomUsers, window.broadcastingUserId);
      return;
    }

    container.classList.remove('broadcast-mode');

    const userCount = roomUsers.length || 0;
    if (userCount === 0) return;

    const compStyles = window.getComputedStyle(container);
    const gap = parseFloat(compStyles.gap) || 0;
    const paddingX =
      (parseFloat(compStyles.paddingLeft) || 0) +
      (parseFloat(compStyles.paddingRight) || 0);
    const paddingY =
      (parseFloat(compStyles.paddingTop) || 0) +
      (parseFloat(compStyles.paddingBottom) || 0);
    const cw = container.clientWidth - paddingX;
    const ch = container.clientHeight - paddingY;

    function computeLayout(count, hint) {
      if (count === 3) return { rows: [2, 1], columns: 2 };
      let cols = Math.min(4, Math.max(1, hint));
      let rowsNeeded = Math.ceil(count / cols);
      if (count % cols === 1 && rowsNeeded > 1 && cols < 4) {
        cols += 1;
        rowsNeeded = Math.ceil(count / cols);
      }
      const base = Math.floor(count / rowsNeeded);
      let extra = count - base * rowsNeeded;
      const rows = new Array(rowsNeeded).fill(base);
      for (let i = 0; i < extra; i++) rows[i] += 1;
      const maxCol = Math.max(...rows);
      return { rows, columns: maxCol };
    }

    let hint = Math.ceil(Math.sqrt(userCount));
    let layout = computeLayout(userCount, hint);
    let colWidth = (cw - gap * (layout.columns - 1)) / layout.columns;
    let cardHeight = (colWidth) * 9 / 16;
    while (
      cardHeight * layout.rows.length + gap * (layout.rows.length - 1) > ch &&
      hint < userCount
    ) {
      hint += 1;
      layout = computeLayout(userCount, hint);
      colWidth = (cw - gap * (layout.columns - 1)) / layout.columns;
      cardHeight = colWidth * 9 / 16;
    }
    const { rows, columns } = layout;
    container.style.gridTemplateColumns = `repeat(${columns}, ${colWidth}px)`;
    container.style.gridAutoRows = `${cardHeight}px`;
    container.style.justifyContent = 'center';

    let index = 0;
    rows.forEach((count, rowIdx) => {
      const offset = Math.floor((columns - count) / 2);
      for (let i = 0; i < count; i++) {
        const u = roomUsers[index++];
        const card = createUserCard(u);
        card.style.gridRow = rowIdx + 1;
        if (count === 1) {
          if (userCount > 1) {
            card.style.gridColumn = `1 / span ${columns}`;
            card.style.width = `${colWidth}px`;
            card.style.justifySelf = 'center';
          } else {
            card.style.gridColumn = '1';
          }
        } else {
          card.style.gridColumn = offset + i + 1;
        }
        container.appendChild(card);
      }
    });
  }
  window.renderVoiceChannelGrid = renderVoiceChannelGrid;

  const channelArea = document.getElementById('channelContentArea');
  const resizeCb = () => {
    if (
      window.currentRoomType === 'voice' &&
      window.latestChannelsData &&
      window.currentRoom &&
      window.latestChannelsData[window.currentRoom]
    ) {
      renderVoiceChannelGrid(
        window.latestChannelsData[window.currentRoom].users,
      );
    }
  };
  if (channelArea) {
    if ('ResizeObserver' in window) {
      if (window.channelAreaResizeObserver) {
        window.channelAreaResizeObserver.disconnect();
      }
      window.channelAreaResizeObserver = new ResizeObserver(resizeCb);
      window.channelAreaResizeObserver.observe(channelArea);
    } else {
      if (window.channelAreaResizeHandler) {
        window.removeEventListener('resize', window.channelAreaResizeHandler);
      }
      window.channelAreaResizeHandler = resizeCb;
      window.addEventListener('resize', window.channelAreaResizeHandler);
    }
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
      try {
        localStorage.setItem('username', data.username);
      } catch (e) {}
      loginScreen.style.display = 'none';
      callScreen.style.display = 'flex';
      socket.emit('set-username', window.username);
      document.getElementById('userCardName').textContent = window.username;
      window.applyAudioStates();
      window.loadAvatar(window.username).then(av => {
        const el = document.getElementById('userCardAvatar');
         if (el) {
          el.style.backgroundImage = `url(${av})`;
          el.dataset.username = window.username;
        }
      });
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
        try {
          localStorage.setItem('lastGroupId', groupObj.id);
        } catch (e) {
          console.warn('Unable to persist lastGroupId', e);
        }
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
    const storedGroup = (() => {
      try {
        return localStorage.getItem('lastGroupId');
      } catch (e) {
        return null;
      }
    })();
    if (storedGroup) {
      const el = groupListDiv.querySelector(`.grp-item[data-group-id="${storedGroup}"]`);
      if (el) {
        el.click();
      }
    }
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
    if (roomObj.type === 'voice') {
      roomItem.classList.add('voice-channel-item');
      roomItem.addEventListener('dragover', (e) => e.preventDefault());
      roomItem.addEventListener('drop', (e) => {
        e.preventDefault();
        hideDragPreview();
        const userId = e.dataTransfer.getData('text/plain');
        if (userId) {
          socket.emit('moveUser', {
            userId,
            groupId: window.selectedGroup,
            roomId: roomObj.id,
          });
        }
      });
    }
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
        const container = document.getElementById('channelUsersContainer');
        if (container) {
          container.style.display = 'none';
          container.innerHTML = '';
        }
        if (!(window.currentRoom && window.currentRoomType === 'voice')) {
          window.hideVoiceSections();
          window.currentRoomType = 'text';
        }
        window.textMessages.innerHTML = '';
        window.currentTextChannel = roomObj.id;
        window.textMessages.dataset.channelId = roomObj.id;
        socket.emit('joinTextChannel', { groupId: window.selectedGroup, roomId: roomObj.id });
        try {
          localStorage.setItem(`lastTextChannel:${window.selectedGroup}`, roomObj.id);
        } catch (e) {
          console.warn('Unable to persist last text channel', e);
        }
        if (typeof window.removeScreenShareEndedMessage === 'function') {
          window.removeScreenShareEndedMessage();
        }
        return;
      }
      window.clearScreenShareUI();
      document.getElementById('channelUsersContainer').style.display = 'grid';
      document.querySelectorAll('.channel-item').forEach((ci) => ci.classList.remove('connected'));
      if (window.currentRoom === roomObj.id && window.currentGroup === window.selectedGroup) {
        roomItem.classList.add('connected');
        window.updateVoiceChannelUI(roomObj.name, true);
        if (
          window.latestChannelsData &&
          window.latestChannelsData[roomObj.id]
        ) {
          renderVoiceChannelGrid(window.latestChannelsData[roomObj.id].users);
        }
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
    const prevTextChannel = window.currentTextChannel;
    roomListDiv.innerHTML = '';
    roomsArray.forEach((roomObj) => {
      const roomItem = buildChannelItem(roomObj);
      roomListDiv.appendChild(roomItem);
      attachChannelDragHandlers(roomItem);
    });
    
    if (prevTextChannel && roomsArray.some((r) => r.id === prevTextChannel)) {
      const el = roomListDiv.querySelector(`.channel-item[data-room-id="${prevTextChannel}"]`);
      if (el) {
        el.classList.add('connected');
      }
      return;
    }

    const storedChannel = (() => {
      try {
        return localStorage.getItem(`lastTextChannel:${window.selectedGroup}`);
      } catch (e) {
        return null;
      }
    })();
    let targetId = null;
    if (storedChannel && roomsArray.some((r) => r.id === storedChannel && r.type === 'text')) {
      targetId = storedChannel;
    } else {
      const firstText = roomsArray.find((r) => r.type === 'text');
      if (firstText) targetId = firstText.id;
    }
    if (targetId) {
      const el = roomListDiv.querySelector(`.channel-item[data-room-id="${targetId}"]`);
      if (el) {
        el.click();
      }
    }
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
      channelContentArea.removeChild(WebRTC.screenShareVideo);
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
  socket.on('roomUsers', (roomUsers) => {
    if (window.currentRoomType === 'voice') {
      renderVoiceChannelGrid(roomUsers);
    }
  });
  socket.on('allChannelsData', (channelsObj) => {
    window.latestChannelsData = channelsObj;
    renderChannelUsers(channelsObj);
    if (
      window.currentRoomType === 'voice' &&
      window.currentRoom &&
      channelsObj[window.currentRoom]
    ) {
      renderVoiceChannelGrid(channelsObj[window.currentRoom].users);
    }
  });
  socket.on('avatarUpdated', ({ username, avatar }) => {
    window.userAvatars[username] = avatar;
    document.querySelectorAll(`[data-username="${username}"]`).forEach(el => {
      if (el.tagName === 'IMG') {
        el.src = avatar || '/images/default-avatar.png';
      } else {
        el.style.backgroundImage = `url(${avatar || '/images/default-avatar.png'})`;
      }
    });
  });
  socket.on('forceLogout', () => {
    callScreen.style.display = 'none';
    loginScreen.style.display = 'block';
    window.username = null;
  })
}