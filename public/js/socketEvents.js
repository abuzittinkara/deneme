import * as UserList from './userList.js';
import * as WebRTC from './webrtc.js';
import { startVolumeAnalysis } from './audioUtils.js';
import * as Ping from './ping.js';
import logger from '../utils/logger.js';

// Holds latest channel data so that we can re-render user lists when needed
window.latestChannelsData = null;
window.unreadCounter = {};
window.channelUnreadCounts = {};
window.groupMuteUntil = {};
window.channelMuteUntil = {};
window.categoryMuteUntil = {};
window.mentionUnread = {};
// Stores DOM nodes for channel user rows keyed by channel and user id
window.channelUserRows = {};

const CATEGORY_COLLAPSE_KEY = 'collapsedCategories';
let collapsedCategories = {};
try {
  collapsedCategories = JSON.parse(localStorage.getItem(CATEGORY_COLLAPSE_KEY)) || {};
} catch (e) {
  collapsedCategories = {};
}
let categoryOrder = {};
function saveCollapsedCategories() {
  try { localStorage.setItem(CATEGORY_COLLAPSE_KEY, JSON.stringify(collapsedCategories)); } catch (e) {}
}

function simulateClick(el) {
  if (el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}

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
let categoryPlaceholder = null;
let draggedCategoryEl = null;

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
    const name = el.querySelector('.channel-header .channel-name')?.textContent || '';
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

function attachCategoryDragHandlers(el) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    draggedCategoryEl = el;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);
    categoryPlaceholder = document.createElement('div');
    categoryPlaceholder.classList.add('category-placeholder');
    el.parentNode.insertBefore(categoryPlaceholder, el.nextSibling);
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    if (categoryPlaceholder) categoryPlaceholder.remove();
    categoryPlaceholder = null;
    el.classList.remove('dragging');
    draggedCategoryEl = null;
  });
}

function setupChannelDragContainer(socket, container, rootContainer = container) {
  container.addEventListener('dragover', (e) => {
    if (!draggedChannelEl) return;
    e.preventDefault();
    const target = e.target.closest('.channel-item');
    if (!target || target === draggedChannelEl) {
      const cat = e.target.closest('.category-row');
      if (cat) {
        const rect = cat.getBoundingClientRect();
        const next = e.clientY - rect.top > rect.height / 2;
        cat.parentNode.insertBefore(channelPlaceholder, next ? cat.nextSibling : cat);
      } else {
        const cont = e.currentTarget;
        if (channelPlaceholder.parentNode !== cont) {
          cont.appendChild(channelPlaceholder);
        }
      }
      updateChannelPreview(e.clientX, e.clientY);
      return;
    }
    const rect = target.getBoundingClientRect();
    const next = e.clientY - rect.top > rect.height / 2;
    target.parentNode.insertBefore(channelPlaceholder, next ? target.nextSibling : target);
    updateChannelPreview(e.clientX, e.clientY);
  });
  container.addEventListener('drop', (e) => {
    if (!draggedChannelEl || !channelPlaceholder) return;
    e.preventDefault();
    channelPlaceholder.parentNode.insertBefore(draggedChannelEl, channelPlaceholder);
    const items = Array.from(rootContainer.querySelectorAll('.category-row, .channel-item'));
    const newIndex = items.indexOf(draggedChannelEl);
    hideChannelPreview();
    channelPlaceholder.remove();
    channelPlaceholder = null;
    draggedChannelEl.classList.remove('dragging');
    const catRow = draggedChannelEl.parentNode.closest('.category-row');
    const categoryId = catRow ? catRow.dataset.categoryId : null;
    socket.emit('assignChannelCategory', {
      groupId: window.selectedGroup,
      channelId: draggedChannelEl.dataset.roomId,
      categoryId
    });
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

  document.addEventListener('dragover', (e) => {
    updateDragPreview(e.clientX, e.clientY);
    updateChannelPreview(e.clientX, e.clientY);
  });

  if (!roomListDiv) {
    logger.warn('roomListDiv element not found, skipping drag and drop setup');
  } else {
    setupChannelDragContainer(socket, roomListDiv);

    roomListDiv.addEventListener('dragover', (e) => {
      if (!draggedCategoryEl) return;
      e.preventDefault();
      const contRect = roomListDiv.getBoundingClientRect();
      if (e.clientY >= contRect.bottom - 5) {
        roomListDiv.appendChild(categoryPlaceholder);
        return;
      }
      const targetEl = e.target.closest('.category-row, .channel-item');
      if (targetEl) {
        if (targetEl === draggedCategoryEl) return;
        const rect = targetEl.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        targetEl.parentNode.insertBefore(
          categoryPlaceholder,
          after ? targetEl.nextSibling : targetEl
        );
      } else {
        const next = e.clientY - contRect.top > contRect.height / 2;
        roomListDiv.insertBefore(
          categoryPlaceholder,
          next ? null : roomListDiv.firstElementChild
        );
      }
    });

    roomListDiv.addEventListener('drop', (e) => {
      if (!draggedCategoryEl || !categoryPlaceholder) return;
      e.preventDefault();
      categoryPlaceholder.parentNode.insertBefore(draggedCategoryEl, categoryPlaceholder);
      // Determine the new index using the full list of category and channel
      // elements in document order rather than only the container's direct
      // children. This ensures channels nested inside categories are also
      // considered when reordering categories at the extremes of the list.
      const items = Array.from(
        roomListDiv.querySelectorAll('.category-row, .channel-item')
      );
      const newIndex = items.indexOf(draggedCategoryEl);
      categoryPlaceholder.remove();
      categoryPlaceholder = null;
      draggedCategoryEl.classList.remove('dragging');
      socket.emit('reorderCategory', {
        groupId: window.selectedGroup,
        categoryId: draggedCategoryEl.dataset.categoryId,
        newIndex,
      });
      draggedCategoryEl.classList.add('snap');
      const dropped = draggedCategoryEl;
      setTimeout(() => dropped.classList.remove('snap'), 150);
      draggedCategoryEl = null;
    });
  }

  if (UserList.initAvatarUpdates) {
    UserList.initAvatarUpdates(socket);
  }

  // Periodically check for expired mutes
  setInterval(() => {
    // Check group mutes
    Object.entries(window.groupMuteUntil || {}).forEach(([gid, ts]) => {
      if (ts !== Infinity && ts && Date.now() > ts) {
        delete window.groupMuteUntil[gid];
        socket.emit('muteGroup', { groupId: gid, duration: 0 });
        const el = groupListDiv.querySelector(`.grp-item[data-group-id="${gid}"]`);
        if (el) el.classList.remove('muted', 'channel-muted');
        if (gid === window.selectedGroup && roomListDiv) {
          roomListDiv
            .querySelectorAll('.channel-item')
            .forEach((ci) => {
              ci.classList.remove('muted', 'channel-muted');
              const cid = ci.dataset.roomId;
              const ts =
                window.channelMuteUntil[gid] && window.channelMuteUntil[gid][cid];
              if (ts && Date.now() < ts) {
                ci.classList.add('muted', 'channel-muted');
              }
            });
        }
      }
    });

    // Check channel mutes
    Object.entries(window.channelMuteUntil || {}).forEach(([gid, channels]) => {
      if (!channels) return;
      Object.entries(channels).forEach(([cid, ts]) => {
        if (ts !== Infinity && ts && Date.now() > ts) {
          delete window.channelMuteUntil[gid][cid];
          socket.emit('muteChannel', {
            groupId: gid,
            channelId: cid,
            duration: 0,
          });
          if (gid === window.selectedGroup && roomListDiv) {
            const item = roomListDiv.querySelector(
              `.channel-item[data-room-id="${cid}"]`
            );
            if (item) item.classList.remove('muted', 'channel-muted');
          }
        }
      });
    });
  }, 60 * 1000);

  function renderChannelUsers(channelsObj) {
    if (!channelsObj) return;

    window.channelUserRows = window.channelUserRows || {};

    function createRow(u) {
      const userRow = document.createElement('div');
      userRow.classList.add('channel-user');
      const leftDiv = document.createElement('div');
      leftDiv.classList.add('channel-user-left');
      userRow.appendChild(leftDiv);
      const rightDiv = document.createElement('div');
      rightDiv.classList.add('channel-user-right');
      userRow.appendChild(rightDiv);
      attachUserDragHandlers(leftDiv, u.id, u.username);
      updateRow(userRow, u);
      return userRow;
    }

    function updateRow(row, u) {
      const leftDiv = row.querySelector('.channel-user-left');
      const rightDiv = row.querySelector('.channel-user-right');

      leftDiv.dataset.userId = u.id;
      leftDiv.dataset.username = u.username;

      let avatarDiv = leftDiv.querySelector('.channel-user-avatar');
      if (!avatarDiv) {
        avatarDiv = document.createElement('div');
        avatarDiv.classList.add('channel-user-avatar');
        leftDiv.prepend(avatarDiv);
      }
      avatarDiv.id = `avatar-${u.id}`;
      avatarDiv.dataset.username = u.username;
      avatarDiv.style.backgroundImage = 'url(/images/default-avatar.png)';
      window.loadAvatar(u.username).then(av => { avatarDiv.style.backgroundImage = `url(${av})`; });

      let nameSpan = leftDiv.querySelector('span.user-name');
      if (!nameSpan) {
        nameSpan = document.createElement('span');
        nameSpan.classList.add('user-name');
        leftDiv.appendChild(nameSpan);
      }
      nameSpan.textContent = u.username || '(İsimsiz)';

      const existingVis = leftDiv.querySelector('.visibility-icon');
      const shouldShowVis = socket.id && Array.isArray(window.screenShareWatchers) && window.screenShareWatchers.includes(u.username);
      if (shouldShowVis) {
        if (!existingVis) {
          const visIcon = document.createElement('span');
          visIcon.classList.add('material-icons', 'visibility-icon');
          visIcon.textContent = 'visibility';
          leftDiv.appendChild(visIcon);
        }
      } else if (existingVis) {
        existingVis.remove();
      }

      rightDiv.innerHTML = '';
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
    }

    Object.keys(channelsObj).forEach((roomId) => {
      const cData = channelsObj[roomId];
      const channelDiv = document.getElementById(`channel-users-${roomId}`);
      if (!channelDiv) return;

      const existing = window.channelUserRows[roomId] || {};
      window.channelUserRows[roomId] = existing;

      const present = new Set();
      cData.users.forEach((u) => {
        let row = existing[u.id];
        if (!row) {
          row = createRow(u);
          existing[u.id] = row;
        } else {
          updateRow(row, u);
        }
        present.add(String(u.id));
        channelDiv.appendChild(row);
      });

      Object.keys(existing).forEach((uid) => {
        if (!present.has(String(uid))) {
          const r = existing[uid];
          if (r && r.parentNode) r.parentNode.removeChild(r);
          delete existing[uid];
        }
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
    logger.info('Socket connected => ' + socket.id);
  });
  socket.on('disconnect', () => {
    logger.warn('Socket disconnect');
  });
  socket.on('loginResult', (data) => {
    if (data.success) {
      window.username = data.username;
      try {
        localStorage.setItem('username', data.username);
        if (data.token) localStorage.setItem('token', data.token);
      } catch (e) {}
      if (data.token) {
        socket.auth = socket.auth || {};
        socket.auth.token = data.token;
        socket.connect();
        socket.once('connect', () => {
          socket.emit('set-username', window.username);
        });
      }
      loginScreen.style.display = 'none';
      callScreen.style.display = 'flex';
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
  socket.on('errorMessage', (msg) => {
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
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
      let unreadCount =
        (groupObj.unreadCount ?? groupObj.unread ?? 0) ||
        (window.unreadCounter && window.unreadCounter[groupObj.id]) ||
        0;
      const mutedTs = window.groupMuteUntil[groupObj.id];
      const muted = mutedTs && Date.now() < mutedTs;
      if (muted) unreadCount = 0;
      const hasMentions =
        window.mentionUnread[groupObj.id] &&
        Object.keys(window.mentionUnread[groupObj.id]).length > 0;
      if (unreadCount >= 1 || hasMentions) {
        const dot = document.createElement('span');
        dot.className = 'unread-dot';
        if (hasMentions) {
          dot.classList.add('mention-dot');
        }
        grpItem.appendChild(dot);
        grpItem.classList.add('unread');
      }
      if (groupObj.id === window.selectedGroup) {
        grpItem.classList.add('selected');
      }
      grpItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.showGroupContextMenu(e, groupObj);
      });
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
      simulateClick(el);
    } else if (groupArray.length > 0) {
      const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupArray[0].id}"]`);
      simulateClick(el);
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
  socket.on('groupUnreadReset', ({ groupId }) => {
    const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
    if (el) {
      const dot = el.querySelector('.unread-dot');
      if (dot) dot.remove();
      el.classList.remove('unread');
    }
    if (window.unreadCounter[groupId]) {
      window.unreadCounter[groupId] = 0;
    }
    if (window.mentionUnread[groupId]) {
      delete window.mentionUnread[groupId];
    }
    if (groupId === window.selectedGroup) {
      roomListDiv.querySelectorAll('.channel-item').forEach(ci => {
        const d = ci.querySelector('.unread-dot');
        if (d) d.remove();
        ci.classList.remove('unread');
      });
    }
  });
  socket.on('channelUnread', ({ groupId, channelId }) => {
    const gMuteTs = window.groupMuteUntil[groupId];
    if (gMuteTs && Date.now() < gMuteTs) return;
    const cMuteTs = window.channelMuteUntil[groupId] && window.channelMuteUntil[groupId][channelId];
    const catId = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`)?.parentNode.closest('.category-row')?.dataset.categoryId;
    const catMuteTs = catId && window.categoryMuteUntil[groupId] && window.categoryMuteUntil[groupId][catId];
    if ((cMuteTs && Date.now() < cMuteTs) || (catMuteTs && Date.now() < catMuteTs)) return;
    if (!window.channelUnreadCounts[groupId]) {
      window.channelUnreadCounts[groupId] = {};
    }
    window.channelUnreadCounts[groupId][channelId] =
      (window.channelUnreadCounts[groupId][channelId] || 0) + 1;
    if (
      groupId !== window.selectedGroup ||
      channelId !== window.currentTextChannel
    ) {
      window.unreadCounter[groupId] = (window.unreadCounter[groupId] || 0) + 1;
      const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
      if (el && !el.querySelector('.unread-dot')) {
        const dot = document.createElement('span');
        dot.className = 'unread-dot';
        el.appendChild(dot);
      }
      if (el) el.classList.add('unread');
      if (groupId === window.selectedGroup) {
        const item = roomListDiv.querySelector(
          `.channel-item[data-room-id="${channelId}"]`
        );
        if (item && !item.querySelector('.unread-dot')) {
          const dot = document.createElement('span');
          dot.className = 'unread-dot';
          item.appendChild(dot);
        }
        if (item) item.classList.add('unread');
      }
    }
  });
  socket.on('mentionUnread', ({ groupId, channelId }) => {
    if (!window.mentionUnread[groupId]) window.mentionUnread[groupId] = {};
    window.mentionUnread[groupId][channelId] = true;
    const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
    if (el) {
      let dot = el.querySelector('.unread-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'unread-dot';
        el.appendChild(dot);
      }
      dot.classList.add('mention-dot');
      el.classList.add('unread');
    }
    if (groupId === window.selectedGroup) {
      const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
      if (item) {
        let dot = item.querySelector('.unread-dot');
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'unread-dot';
          item.appendChild(dot);
        }
        dot.classList.add('mention-dot');
        item.classList.add('unread');
      }
    }
  });
  socket.on('channelRead', ({ groupId, channelId }) => {
    if (window.unreadCounter[groupId]) {
      window.unreadCounter[groupId] = Math.max(0, window.unreadCounter[groupId] - 1);
    }
    if (window.channelUnreadCounts[groupId]) {
      window.channelUnreadCounts[groupId][channelId] = 0;
    }
    if (window.mentionUnread[groupId]) {
      delete window.mentionUnread[groupId][channelId];
      if (Object.keys(window.mentionUnread[groupId]).length === 0) {
        delete window.mentionUnread[groupId];
      }
    }
    const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
    if (el) {
      if (window.unreadCounter[groupId] === 0) {
        const dot = el.querySelector('.unread-dot');
        if (dot) dot.remove();
        el.classList.remove('unread');
      } else {
        const dot = el.querySelector('.unread-dot');
        if (
          dot &&
          (!window.mentionUnread[groupId] || Object.keys(window.mentionUnread[groupId]).length === 0)
        ) {
          dot.classList.remove('mention-dot');
        }
      }
    }
    if (groupId === window.selectedGroup) {
      const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
      if (item) {
        const dot = item.querySelector('.unread-dot');
        if (dot) {
          dot.classList.remove('mention-dot');
          dot.remove();
        }
        item.classList.remove('unread');
      }
    }
  });
  socket.on('mentionCounts', (data) => {
    window.mentionUnread = {};
    Object.entries(data || {}).forEach(([gid, channels]) => {
      Object.entries(channels).forEach(([cid, count]) => {
        if (Number(count) > 0) {
          if (!window.mentionUnread[gid]) window.mentionUnread[gid] = {};
          window.mentionUnread[gid][cid] = true;
        }
      });
    });
  });
  socket.on('unreadCounts', (data) => {
    window.unreadCounter = window.unreadCounter || {};
    window.channelUnreadCounts = data || {};
    Object.entries(data || {}).forEach(([gid, channels]) => {
      const total = Object.values(channels).reduce((a, b) => a + (Number(b) || 0), 0);
      const gMuteTs = window.groupMuteUntil[gid];
      const gMuted = gMuteTs && Date.now() < gMuteTs;
      const el = groupListDiv.querySelector(`.grp-item[data-group-id="${gid}"]`);
      if (total > 0 && !gMuted) {
        window.unreadCounter[gid] = total;
        let dot = el && el.querySelector('.unread-dot');
        if (el && !dot) {
          dot = document.createElement('span');
          dot.className = 'unread-dot';
          el.appendChild(dot);
        }
        if (
          dot &&
          window.mentionUnread[gid] &&
          Object.keys(window.mentionUnread[gid]).length > 0
        ) {
          dot.classList.add('mention-dot');
        }
        if (el) el.classList.add('unread');
      } else {
        if (el) {
          const dot = el.querySelector('.unread-dot');
          if (dot) dot.remove();
          el.classList.remove('unread');
        }
      }
      if (gid === window.selectedGroup) {
        Object.entries(channels).forEach(([cid, count]) => {
          const item = roomListDiv.querySelector(`.channel-item[data-room-id="${cid}"]`);
          if (!item) return;
          const cMuteTs = window.channelMuteUntil[gid] && window.channelMuteUntil[gid][cid];
          const muted = gMuted || (cMuteTs && Date.now() < cMuteTs);
          let dot = item.querySelector('.unread-dot');
          if (count > 0 && !muted && !dot) {
            dot = document.createElement('span');
            dot.className = 'unread-dot';
            item.appendChild(dot);
          } else if ((count === 0 || muted) && dot) {
            dot.remove();
          }
          if (count > 0 && !muted && dot) {
            if (
              window.mentionUnread[gid] &&
              window.mentionUnread[gid][cid]
            ) {
              dot.classList.add('mention-dot');
            }
          }
          if (count > 0 && !muted) {
            item.classList.add('unread');
          } else {
            item.classList.remove('unread');
          }
        });
      }
    });
  });

  const INDEFINITE_TS = 8640000000000000;

  socket.on('activeMutes', (mutes) => {
    window.groupMuteUntil = window.groupMuteUntil || {};
    window.channelMuteUntil = window.channelMuteUntil || {};
    window.categoryMuteUntil = window.categoryMuteUntil || {};
    Object.entries(mutes || {}).forEach(([gid, info]) => {
      if (info.muteUntil) {
        const ts = new Date(info.muteUntil).getTime();
        window.groupMuteUntil[gid] = ts >= INDEFINITE_TS ? Infinity : ts;
        const gEl = groupListDiv.querySelector(`.grp-item[data-group-id="${gid}"]`);
        if (gEl) gEl.classList.add('muted');
        if (gid === window.selectedGroup) {
          roomListDiv.querySelectorAll('.channel-item').forEach((ci) =>
            ci.classList.add('muted', 'channel-muted')
          );
        }
      }
      if (info.channelMuteUntil) {
        if (!window.channelMuteUntil[gid]) window.channelMuteUntil[gid] = {};
        Object.entries(info.channelMuteUntil).forEach(([cid, tsVal]) => {
          const ts = new Date(tsVal).getTime();
          window.channelMuteUntil[gid][cid] = ts >= INDEFINITE_TS ? Infinity : ts;
          if (gid === window.selectedGroup) {
            const item = roomListDiv.querySelector(`.channel-item[data-room-id="${cid}"]`);
            if (item) item.classList.add('muted', 'channel-muted');
          }
        });
      }
      if (info.categoryMuteUntil) {
        if (!window.categoryMuteUntil[gid]) window.categoryMuteUntil[gid] = {};
        Object.entries(info.categoryMuteUntil).forEach(([cid, tsVal]) => {
          const ts = new Date(tsVal).getTime();
          window.categoryMuteUntil[gid][cid] = ts >= INDEFINITE_TS ? Infinity : ts;
          if (gid === window.selectedGroup) {
            const row = roomListDiv.querySelector(`.category-row[data-category-id="${cid}"]`);
            if (row) row.classList.add('muted');
          }
        });
      }
    });
  });

  socket.on('activeNotifyTypes', (data) => {
    window.groupNotifyType = {};
    window.channelNotifyType = {};
    Object.entries(data || {}).forEach(([gid, info]) => {
      if (info.notificationType) {
        window.groupNotifyType[gid] = info.notificationType;
      }
      if (info.channelNotificationType) {
        window.channelNotifyType[gid] = info.channelNotificationType;
      }
    });
  });

  socket.on('activeCategoryPrefs', (data) => {
    categoryOrder = data.order || {};
    Object.entries(data.collapsed || {}).forEach(([gid, cats]) => {
      Object.entries(cats).forEach(([cid, val]) => {
        collapsedCategories[cid] = !!val;
      });
    });
    saveCollapsedCategories();
  });

  socket.on('groupNotifyTypeUpdated', ({ groupId, type }) => {
    if (!groupId) return;
    window.groupNotifyType[groupId] = type;
    if (window.openNotifyTarget && window.openNotifyType === 'group' &&
        window.openNotifyTarget.dataset.groupId === groupId) {
      window.showNotificationSubMenu(window.openNotifyTarget, 'group');
    }
  });

  socket.on('channelNotifyTypeUpdated', ({ groupId, channelId, type }) => {
    if (!groupId || !channelId) return;
    window.channelNotifyType[groupId] = window.channelNotifyType[groupId] || {};
    window.channelNotifyType[groupId][channelId] = type;
    if (window.openNotifyTarget && window.openNotifyType === 'channel' &&
        window.openNotifyTarget.dataset.channelId === channelId &&
        window.openNotifyTarget.dataset.groupId === groupId) {
      window.showNotificationSubMenu(window.openNotifyTarget, 'channel');
    }
  });

  socket.on('groupMuted', ({ groupId, muteUntil }) => {
    if (!groupId) return;
    if (muteUntil) {
      const ts = new Date(muteUntil).getTime();
      window.groupMuteUntil[groupId] = ts >= INDEFINITE_TS ? Infinity : ts;
    } else {
      window.groupMuteUntil[groupId] = 0;
    }
    const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
    if (el) {
      const dot = el.querySelector('.unread-dot');
      if (dot) dot.remove();
      el.classList.remove('unread');
      el.classList.add('muted');
    }
    window.unreadCounter[groupId] = 0;
    if (groupId === window.selectedGroup) {
      roomListDiv.querySelectorAll('.channel-item').forEach(ci => {
        const d = ci.querySelector('.unread-dot');
        if (d) d.remove();
        ci.classList.remove('unread');
      });
      if (window.channelUnreadCounts[groupId]) {
        Object.keys(window.channelUnreadCounts[groupId]).forEach(cid => {
          window.channelUnreadCounts[groupId][cid] = 0;
        });
      }
    }
  });

  socket.on('channelMuted', ({ groupId, channelId, muteUntil }) => {
    if (!groupId || !channelId) return;
    if (!window.channelMuteUntil[groupId]) window.channelMuteUntil[groupId] = {};
    if (muteUntil) {
      const ts = new Date(muteUntil).getTime();
      window.channelMuteUntil[groupId][channelId] = ts >= INDEFINITE_TS ? Infinity : ts;
    } else {
      window.channelMuteUntil[groupId][channelId] = 0;
    }
    if (window.channelUnreadCounts[groupId]) {
      window.channelUnreadCounts[groupId][channelId] = 0;
    }
    if (groupId === window.selectedGroup) {
      const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
      if (item) {
        const dot = item.querySelector('.unread-dot');
        if (dot) dot.remove();
        item.classList.remove('unread');
        item.classList.add('muted', 'channel-muted');
      }
      const total = Object.values(window.channelUnreadCounts[groupId] || {}).reduce((a,b)=>a+(Number(b)||0),0);
      if (total === 0) {
        const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
        if (el) {
          const dot = el.querySelector('.unread-dot');
          if (dot) dot.remove();
          el.classList.remove('unread');
          el.classList.add('muted');
        }
        window.unreadCounter[groupId] = 0;
      }
    }
  });

  socket.on('categoryMuted', ({ groupId, categoryId, muteUntil }) => {
    if (!groupId || !categoryId) return;
    if (!window.categoryMuteUntil[groupId]) window.categoryMuteUntil[groupId] = {};
    if (muteUntil) {
      const ts = new Date(muteUntil).getTime();
      window.categoryMuteUntil[groupId][categoryId] = ts >= INDEFINITE_TS ? Infinity : ts;
    } else {
      window.categoryMuteUntil[groupId][categoryId] = 0;
    }
    if (groupId === window.selectedGroup) {
      const row = roomListDiv.querySelector(`.category-row[data-category-id="${categoryId}"]`);
      if (row) row.classList.add('muted');
    }
  });

  socket.on('muteCleared', ({ groupId, channelId, categoryId }) => {
    if (channelId) {
      if (window.channelMuteUntil[groupId]) delete window.channelMuteUntil[groupId][channelId];
      const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
      if (item) item.classList.remove('muted', 'channel-muted');
    } else if (categoryId) {
      if (window.categoryMuteUntil[groupId]) delete window.categoryMuteUntil[groupId][categoryId];
      const row = roomListDiv.querySelector(`.category-row[data-category-id="${categoryId}"]`);
      if (row) row.classList.remove('muted');
    } else if (groupId) {
      delete window.groupMuteUntil[groupId];
      const el = groupListDiv.querySelector(`.grp-item[data-group-id="${groupId}"]`);
      if (el) el.classList.remove('muted');
      if (groupId === window.selectedGroup) {
        roomListDiv.querySelectorAll('.channel-item').forEach(ci => {
          ci.classList.remove('muted', 'channel-muted');
          const cid = ci.dataset.roomId;
          const ts =
            window.channelMuteUntil[groupId] && window.channelMuteUntil[groupId][cid];
          if (ts && Date.now() < ts) {
            ci.classList.add('muted', 'channel-muted');
          }
        });
      }
    }
  });

  socket.on('categoryCollapseUpdated', ({ groupId, categoryId, collapsed }) => {
    collapsedCategories[categoryId] = collapsed;
    saveCollapsedCategories();
    if (groupId === window.selectedGroup) {
      const row = roomListDiv.querySelector(`.category-row[data-category-id="${categoryId}"]`);
      if (row) {
        updateCategoryDisplay(row);
      }
    }
  });

  socket.on('categoryOrderUpdated', ({ groupId, order }) => {
    categoryOrder[groupId] = order || {};
    if (groupId === window.selectedGroup) {
      const rows = Array.from(roomListDiv.querySelectorAll('.category-row'));
      rows.sort((a, b) => {
        const oa = order[a.dataset.categoryId];
        const ob = order[b.dataset.categoryId];
        return (oa ?? 0) - (ob ?? 0);
      });
      rows.forEach(r => roomListDiv.appendChild(r));
    }
  });

  function buildChannelItem(roomObj) {
    const roomItem = document.createElement('div');
    roomItem.className = 'channel-item';
    roomItem.dataset.roomId = roomObj.id;
    let unreadCount = roomObj.unreadCount ?? roomObj.unread ?? 0;
    const gMuteTs = window.groupMuteUntil[window.selectedGroup];
    const gMuted = gMuteTs && Date.now() < gMuteTs;
    const cMuteTs =
      window.channelMuteUntil[window.selectedGroup] &&
      window.channelMuteUntil[window.selectedGroup][roomObj.id];
    const cMuted = cMuteTs && Date.now() < cMuteTs;
    if (gMuted || cMuted) {
      unreadCount = 0;
      roomItem.classList.add('muted', 'channel-muted');
    }
    if (roomObj.type === 'text' && unreadCount > 0) {
      const dot = document.createElement('span');
      dot.className = 'unread-dot';
      if (
        window.mentionUnread[window.selectedGroup] &&
        window.mentionUnread[window.selectedGroup][roomObj.id]
      ) {
        dot.classList.add('mention-dot');
      }
      roomItem.appendChild(dot);
      roomItem.classList.add('unread');
    }
    if (!window.channelUnreadCounts[window.selectedGroup]) {
      window.channelUnreadCounts[window.selectedGroup] = {};
    }
    if (roomObj.type === 'text') {
      window.channelUnreadCounts[window.selectedGroup][roomObj.id] = unreadCount;
    }
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
    textSpan.classList.add('channel-name');
    textSpan.textContent = roomObj.name;
    channelHeader.appendChild(icon);
    channelHeader.appendChild(textSpan);
    const settingsBtn = document.createElement('span');
    settingsBtn.classList.add('material-icons', 'channel-settings-btn');
    settingsBtn.textContent = 'settings';
    channelHeader.appendChild(settingsBtn);
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
        document.querySelectorAll('.channel-item').forEach((ci) => ci.classList.remove('connected'));
        roomItem.classList.add('connected');
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

  function buildCategoryRow(catObj) {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.dataset.categoryId = catObj.id;
    const header = document.createElement('div');
    header.className = 'category-header';
    const icon = document.createElement('span');
    icon.classList.add('material-icons', 'collapse-icon');
    const collapsed = collapsedCategories[catObj.id];
    icon.textContent = collapsed ? 'chevron_right' : 'expand_more';
    row.classList.toggle('expanded', !collapsed);
    const muteTs = window.categoryMuteUntil[window.selectedGroup] && window.categoryMuteUntil[window.selectedGroup][catObj.id];
    const muted = muteTs && Date.now() < muteTs;
    const nameEl = document.createElement('span');
    nameEl.className = 'category-name';
    nameEl.textContent = catObj.name;
    const addBtn = document.createElement('span');
    addBtn.classList.add('material-icons', 'category-add-btn');
    addBtn.textContent = 'add';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.createChannelTargetCategory = catObj.id;
      if (window.roomModal) {
        window.roomModal.style.display = 'flex';
        window.roomModal.classList.add('active');
      }
    });
    header.appendChild(nameEl);
    header.appendChild(icon);
    header.appendChild(addBtn);
    if (muted) row.classList.add('muted');
    row.appendChild(header);
    const channelContainer = document.createElement('div');
    channelContainer.className = 'category-channels';
    if (collapsed) channelContainer.style.display = 'none';
    row.appendChild(channelContainer);
    header.addEventListener('click', () => {
      collapsedCategories[catObj.id] = !collapsedCategories[catObj.id];
      saveCollapsedCategories();
      updateCategoryDisplay(row);
      socket.emit('setCategoryCollapsed', {
        groupId: window.selectedGroup,
        categoryId: catObj.id,
        collapsed: collapsedCategories[catObj.id]
      });
    });
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.showCategoryContextMenu(e, catObj);
    });

    header.addEventListener('dragover', (e) => {
      if (!draggedChannelEl) return;
      e.preventDefault();
      if (channelContainer.style.display === 'none') {
        channelContainer.style.display = 'flex';
        icon.textContent = 'expand_more';
        row.classList.add('expanded');
        collapsedCategories[catObj.id] = false;
        saveCollapsedCategories();
        socket.emit('setCategoryCollapsed', {
          groupId: window.selectedGroup,
          categoryId: catObj.id,
          collapsed: false
        });
      }
      if (channelPlaceholder && channelPlaceholder.parentNode !== channelContainer) {
        channelContainer.appendChild(channelPlaceholder);
      }
      updateChannelPreview(e.clientX, e.clientY);
    });
    header.addEventListener('drop', (e) => {
      if (!draggedChannelEl || !channelPlaceholder) return;
      e.preventDefault();
      if (channelPlaceholder.parentNode !== channelContainer) {
        channelContainer.appendChild(channelPlaceholder);
      }
      if (channelPlaceholder.parentNode === channelContainer) {
        channelContainer.insertBefore(draggedChannelEl, channelPlaceholder);
      }
      const items = Array.from(roomListDiv.querySelectorAll('.category-row, .channel-item'));
      const newIndex = items.indexOf(draggedChannelEl);
      hideChannelPreview();
      channelPlaceholder.remove();
      channelPlaceholder = null;
      draggedChannelEl.classList.remove('dragging');
      socket.emit('assignChannelCategory', {
        groupId: window.selectedGroup,
        channelId: draggedChannelEl.dataset.roomId,
        categoryId: catObj.id
      });
      socket.emit('reorderChannel', {
        groupId: window.selectedGroup,
        channelId: draggedChannelEl.dataset.roomId,
        newIndex
      });
      draggedChannelEl.classList.add('snap');
      const droppedEl = draggedChannelEl;
      setTimeout(() => droppedEl.classList.remove('snap'), 150);
      draggedChannelEl = null;
      updateCategoryDisplay(row);
    });
    attachCategoryDragHandlers(row);
    updateCategoryDisplay(row);
    return row;
  }

  function updateCategoryDisplay(row) {
    const container = row.querySelector('.category-channels');
    const icon = row.querySelector('.collapse-icon');
    const catId = row.dataset.categoryId;
    const collapsed = collapsedCategories[catId];
    const hasChannels = container && container.children.length > 0;
    if (container) {
      container.style.display = !collapsed && hasChannels ? 'flex' : 'none';
    }
    if (icon) icon.textContent = collapsed ? 'chevron_right' : 'expand_more';
    row.classList.toggle('expanded', !collapsed && hasChannels);
  }

  function updateChannelItem(el, roomObj) {
    el.classList.toggle('voice-channel-item', roomObj.type === 'voice');
    el.dataset.roomId = roomObj.id;

    let unreadCount = roomObj.unreadCount ?? roomObj.unread ?? 0;
    const gMuteTs = window.groupMuteUntil[window.selectedGroup];
    const gMuted = gMuteTs && Date.now() < gMuteTs;
    const cMuteTs =
      window.channelMuteUntil[window.selectedGroup] &&
      window.channelMuteUntil[window.selectedGroup][roomObj.id];
    const cMuted = cMuteTs && Date.now() < cMuteTs;

    if (gMuted || cMuted) {
      unreadCount = 0;
      el.classList.add('muted', 'channel-muted');
    } else {
      el.classList.remove('muted', 'channel-muted');
    }

    const nameEl = el.querySelector('.channel-header .channel-name');
    if (nameEl) nameEl.textContent = roomObj.name;

    if (!window.channelUnreadCounts[window.selectedGroup]) {
      window.channelUnreadCounts[window.selectedGroup] = {};
    }

    if (roomObj.type === 'text') {
      window.channelUnreadCounts[window.selectedGroup][roomObj.id] = unreadCount;
      let dot = el.querySelector('.unread-dot');
      const hasMention =
        window.mentionUnread[window.selectedGroup] &&
        window.mentionUnread[window.selectedGroup][roomObj.id];
      if (unreadCount > 0 && !gMuted && !cMuted) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'unread-dot';
          el.appendChild(dot);
        }
        dot.classList.toggle('mention-dot', Boolean(hasMention));
        el.classList.add('unread');
      } else {
        if (dot) dot.remove();
        el.classList.remove('unread');
      }
    }
  }

  function syncChildren(container, nodes) {
    let child = container.firstChild;
    let frag = document.createDocumentFragment();
    nodes.forEach((node) => {
      if (node === child) {
        if (frag.firstChild) {
          container.insertBefore(frag, child);
          frag = document.createDocumentFragment();
        }
        child = child.nextSibling;
      } else {
        frag.appendChild(node);
      }
    });
    if (frag.firstChild) {
      container.insertBefore(frag, child);
    }
    while (child) {
      const next = child.nextSibling;
      child.remove();
      child = next;
    }
  }

  socket.on('channelRenamed', ({ channelId, newName }) => {
    const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
    if (item) {
      const nameEl = item.querySelector('.channel-header .channel-name');
      if (nameEl) {
        nameEl.textContent = newName;
      }
    }
  });

  socket.on('channelDeleted', ({ channelId }) => {
    const item = roomListDiv.querySelector(`.channel-item[data-room-id="${channelId}"]`);
    if (item) {
      item.remove();
    }
  });
  socket.on('roomsList', (items = []) => {
    const prevTextChannel = window.currentTextChannel;
    window.channelUnreadCounts[window.selectedGroup] = {};

    const existingCats = {};
    roomListDiv.querySelectorAll('.category-row').forEach((row) => {
      existingCats[row.dataset.categoryId] = row;
    });
    const existingChans = {};
    roomListDiv.querySelectorAll('.channel-item').forEach((el) => {
      existingChans[el.dataset.roomId] = el;
    });

    const rootNodes = [];
    const catContainers = {};
    const catChannelNodes = {};

    items.forEach((item) => {
      if (item.type === 'category') {
        let row = existingCats[item.id];
        if (!row) {
          row = buildCategoryRow(item);
        }
        catContainers[item.id] = row.querySelector('.category-channels');
        rootNodes.push(row);
      } else {
        let el = existingChans[item.id];
        if (!el) {
          el = buildChannelItem(item);
          attachChannelDragHandlers(el);
        } else {
          updateChannelItem(el, item);
        }
        if (item.categoryId) {
          if (!catChannelNodes[item.categoryId]) catChannelNodes[item.categoryId] = [];
          catChannelNodes[item.categoryId].push(el);
        } else {
          rootNodes.push(el);
        }
      }
    });

    syncChildren(roomListDiv, rootNodes);
    Object.entries(catContainers).forEach(([cid, container]) => {
      syncChildren(container, catChannelNodes[cid] || []);
      setupChannelDragContainer(socket, container, roomListDiv);
    });
    roomListDiv.querySelectorAll('.category-row').forEach(updateCategoryDisplay);
    setupChannelDragContainer(socket, roomListDiv, roomListDiv);

    const groupItem = groupListDiv.querySelector(`.grp-item[data-group-id="${window.selectedGroup}"]`);
    const totalUnread = Object.values(window.channelUnreadCounts[window.selectedGroup] || {}).reduce((a,b)=>a+(Number(b)||0),0);
    window.unreadCounter[window.selectedGroup] = totalUnread;
    if (groupItem) {
      let dot = groupItem.querySelector('.unread-dot');
      if (totalUnread > 0) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'unread-dot';
          groupItem.appendChild(dot);
        }
        groupItem.classList.add('unread');
      } else {
        if (dot) dot.remove();
        groupItem.classList.remove('unread');
      }
    }

    if (prevTextChannel && items.some((r) => r.id === prevTextChannel)) {
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
    if (storedChannel && items.some((r) => r.id === storedChannel && r.type === 'text')) {
      targetId = storedChannel;
    } else {
      const firstText = items.find((r) => r.type === 'text');
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