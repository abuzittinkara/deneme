import * as ScreenShare from './screenShare.js';
import { applyAudioStates } from './audioUtils.js';
import { sendTransport } from './webrtc.js';
import * as Ping from './ping.js';
import { getAttachments, clearAttachments, updateAttachmentProgress, markAttachmentFailed } from './attachments.js';
import { toggleInputIcons } from './uiHelpers.js';

export function initUIEvents(socket, attemptLogin, attemptRegister) {
  const {
    loginButton,
    loginForm,
    loginUsernameInput,
    loginPasswordInput,
    registerButton,
    regPasswordConfirmInput,
    loginScreen,
    registerScreen,
    showRegisterScreen,
    showLoginScreen,
    backToLoginButton,
    groupDropdownIcon,
    groupDropdownMenu,
    copyGroupIdBtn,
    createGroupButton,
    createChannelBtn,
    groupSettingsBtn,
    leaveGroupBtn,
    toggleDMButton,
    roomPanel,
    rightPanel,
    leaveButton,
    micToggleButton,
    deafenToggleButton,
    settingsButton,
    sendTextMessageBtn,
    micMessageBtn,
    textChannelMessageInput,
    screenShareButton,
    screenShareLargeButton,
    toggleUserListButton,
    channelContentArea,
    selectedChannelTitle,
    textChannelContainer,
    groupModal,
    modalGroupCreateBtn,
    modalGroupJoinBtn,
    actualGroupCreateModal,
    actualGroupName,
    actualGroupNameBtn,
    closeCreateGroupModal,
    joinGroupModal,
    joinGroupIdInput,
    joinGroupIdBtn,
    closeJoinGroupModal,
    groupSettingsModal,
    closeGroupSettingsModal,
    userSettingsPage,
    closeUserSettingsPageBtn,
    roomModal,
    modalRoomName,
    textChannel,
    voiceChannel,
    modalCreateRoomBtn,
    modalCloseRoomBtn,
  } = window;

  const RIGHT_PANEL_KEY = 'rightPanelOpen';
  const initialPanelOpen = (() => {
    try { return localStorage.getItem(RIGHT_PANEL_KEY) !== '0'; } catch (e) { return true; }
  })();
  if (!initialPanelOpen) {
    rightPanel.classList.add('collapsed');
    rightPanel.style.display = 'none';
  } else {
    rightPanel.style.display = 'flex';
  }

  function applyRightPanelState(open) {
    if (open) {
      rightPanel.style.display = 'flex';
      // force reflow so the slide-in transition runs reliably
      void rightPanel.offsetWidth;
      requestAnimationFrame(() => rightPanel.classList.remove('collapsed'));
    } else {
      rightPanel.classList.add('collapsed');
      rightPanel.addEventListener('transitionend', function handler(e) {
        if (e.propertyName === 'width') {
          rightPanel.style.display = 'none';
          rightPanel.removeEventListener('transitionend', handler);
        }
      });
    }
  }

  function setRightPanelOpen(open) {
    applyRightPanelState(open);
    try { localStorage.setItem(RIGHT_PANEL_KEY, open ? '1' : '0'); } catch (e) {}
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    attemptLogin();
  });

  registerButton.addEventListener('click', () => attemptRegister());
  regPasswordConfirmInput.addEventListener('keydown', (e) => e.key === 'Enter' && attemptRegister());

  showRegisterScreen.addEventListener('click', () => {
    loginScreen.style.display = 'none';
    registerScreen.style.display = 'block';
  });
  showLoginScreen.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });
  backToLoginButton.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });

  if (groupDropdownIcon) {
    groupDropdownIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (groupDropdownMenu.style.display === 'none' || !groupDropdownMenu.style.display) {
        groupDropdownMenu.style.display = 'flex';
      } else {
        groupDropdownMenu.style.display = 'none';
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (
      groupDropdownMenu &&
      groupDropdownMenu.style.display !== 'none' &&
      !groupDropdownMenu.contains(e.target) &&
      e.target !== groupDropdownIcon
    ) {
      groupDropdownMenu.style.display = 'none';
    }
  });
  
  if (copyGroupIdBtn) {
    copyGroupIdBtn.addEventListener('click', () => {
      const gid = window.selectedGroup || window.currentGroup;
      if (gid) navigator.clipboard.writeText(gid);
      if (groupDropdownMenu) groupDropdownMenu.style.display = 'none';
    });
  }

  if (createChannelBtn) {
    createChannelBtn.addEventListener('click', () => {
      if (roomModal) {
        roomModal.style.display = 'flex';
        roomModal.classList.add('active');
      }
      if (groupDropdownMenu) groupDropdownMenu.style.display = 'none';
    });
  }

  if (modalCloseRoomBtn) {
    modalCloseRoomBtn.addEventListener('click', () => {
      if (roomModal) {
        roomModal.style.display = 'none';
        roomModal.classList.remove('active');
      }
    });
  }

  if (modalCreateRoomBtn) {
    modalCreateRoomBtn.addEventListener('click', () => {
      const name = modalRoomName ? modalRoomName.value.trim() : '';
      if (!name) return;
      const type = voiceChannel && voiceChannel.checked ? 'voice' : 'text';
      socket.emit('createChannel', { groupId: window.selectedGroup, name, type });
      modalRoomName.value = '';
      if (roomModal) {
        roomModal.style.display = 'none';
        roomModal.classList.remove('active');
      }
    });
  }
  
  if (groupSettingsBtn) {
    groupSettingsBtn.addEventListener('click', () => {
      if (
        groupSettingsModal &&
        groupSettingsBtn.style.display !== 'none'
      ) {
        groupSettingsModal.style.display = 'flex';
        groupSettingsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
      if (groupDropdownMenu) groupDropdownMenu.style.display = 'none';
    });
  }

  if (leaveGroupBtn) {
    leaveGroupBtn.addEventListener('click', () => {
      if (window.selectedGroup) socket.emit('leaveGroup', window.selectedGroup);
      if (groupDropdownMenu) groupDropdownMenu.style.display = 'none';
    });
  }

  if (createGroupButton) {
    createGroupButton.addEventListener('click', () => {
      if (groupModal) {
        groupModal.style.display = 'flex';
        groupModal.classList.add('active');
      }
    });
  }

  if (modalGroupCreateBtn) {
    modalGroupCreateBtn.addEventListener('click', () => {
      if (groupModal) {
        groupModal.style.display = 'none';
        groupModal.classList.remove('active');
      }
      if (actualGroupCreateModal) {
        actualGroupCreateModal.style.display = 'flex';
        actualGroupCreateModal.classList.add('active');
      }
    });
  }

  if (modalGroupJoinBtn) {
    modalGroupJoinBtn.addEventListener('click', () => {
      if (groupModal) {
        groupModal.style.display = 'none';
        groupModal.classList.remove('active');
      }
      if (joinGroupModal) {
        joinGroupModal.style.display = 'flex';
        joinGroupModal.classList.add('active');
      }
    });
  }

  if (closeCreateGroupModal) {
    closeCreateGroupModal.addEventListener('click', () => {
      if (actualGroupCreateModal) {
        actualGroupCreateModal.style.display = 'none';
        actualGroupCreateModal.classList.remove('active');
      }
    });
  }

  if (closeJoinGroupModal) {
    closeJoinGroupModal.addEventListener('click', () => {
      if (joinGroupModal) {
        joinGroupModal.style.display = 'none';
        joinGroupModal.classList.remove('active');
      }
    });
  }

  if (closeGroupSettingsModal) {
    closeGroupSettingsModal.addEventListener('click', () => {
      if (groupSettingsModal) {
        groupSettingsModal.style.display = 'none';
        groupSettingsModal.classList.remove('active');
      }
      document.body.style.overflow = '';
    });
  }


  if (closeUserSettingsPageBtn) {
    closeUserSettingsPageBtn.addEventListener('click', () => {
      if (typeof window.closeUserSettings === 'function') {
        window.closeUserSettings();
      }
    });
  }

  if (actualGroupNameBtn) {
    actualGroupNameBtn.addEventListener('click', () => {
      const name = actualGroupName ? actualGroupName.value.trim() : '';
      if (!name) return;
      const channelName = prompt('Metin kanalı adı:', 'general');
      if (channelName && channelName.trim() !== '') {
        socket.emit('createGroup', {
          groupName: name,
          channelName: channelName.trim()
        });
        actualGroupName.value = '';
        if (actualGroupCreateModal) actualGroupCreateModal.style.display = 'none';
      }
    });
  }

  if (joinGroupIdBtn) {
    joinGroupIdBtn.addEventListener('click', () => {
      const gid = joinGroupIdInput ? joinGroupIdInput.value.trim() : '';
      if (gid) {
        socket.emit('joinGroup', gid);
        joinGroupIdInput.value = '';
        if (joinGroupModal) joinGroupModal.style.display = 'none';
      }
    });
  }

  toggleDMButton.addEventListener('click', () => {
    window.removeScreenShareEndedMessage();
    const channelContentArea = document.getElementById('channelContentArea');
    const selectedChannelBar = document.getElementById('selectedChannelBar');
    const selectedDMBar = document.getElementById('selectedDMBar');
    const dmContentArea = document.getElementById('dmContentArea');
    const dmPanel = document.getElementById('dmPanel');
    if (!window.isDMMode) {
      roomPanel.style.display = 'none';
      channelContentArea.style.display = 'none';
      applyRightPanelState(false);
      selectedChannelBar.style.display = 'none';
      selectedDMBar.style.display = 'flex';
      dmContentArea.style.display = 'flex';
      dmPanel.style.display = 'block';
      toggleDMButton.querySelector('.material-icons').textContent = 'group';
      window.isDMMode = true;
    } else {
      roomPanel.style.display = 'flex';
      channelContentArea.style.display = 'flex';
      const stored = (() => { try { return localStorage.getItem(RIGHT_PANEL_KEY) !== '0'; } catch (e) { return true; } })();
      applyRightPanelState(stored);
      selectedDMBar.style.display = 'none';
      dmContentArea.style.display = 'none';
      dmPanel.style.display = 'none';
      selectedChannelBar.style.display = 'flex';
      toggleDMButton.querySelector('.material-icons').textContent = 'forum';
      selectedChannelTitle.textContent = 'Kanal Seçilmedi';
      window.isDMMode = false;
      const messages = document.getElementById('textMessages');
      const chatInput = document.getElementById('textChannelMessageInput');
      const chatBar = document.getElementById('textChatInputBar');
      if (messages) messages.style.width = '';
      if (chatInput) chatInput.style.width = '';
      if (chatBar) chatBar.style.width = '';
    }
  });

  if (toggleUserListButton) {
    toggleUserListButton.addEventListener('click', () => {
      const open = !rightPanel.classList.contains('collapsed');
      setRightPanelOpen(!open);
    });
  }

  if (leaveButton) {
    leaveButton.addEventListener('click', () => {
      window.clearScreenShareUI();
      if (!window.currentRoom) return;
      socket.emit('leaveRoom', {
        groupId: window.currentGroup,
        roomId: window.currentRoom,
      });
      window.leaveRoomInternal(socket);
      window.activeVoiceChannelName = '';
      window.activeVoiceGroupName = '';
      Ping.updateStatusPanel(0);
      if (typeof window.hideVoiceSections === 'function') {
        window.hideVoiceSections();
      }
      const container = document.getElementById('channelUsersContainer');
      if (container) {
        container.innerHTML = '';
      }
      document.querySelectorAll('.channel-item').forEach((ci) => ci.classList.remove('connected'));
      socket.emit('browseGroup', window.currentGroup);
      if (window.currentTextChannel) {
        const el = document.querySelector(`.channel-item[data-room-id="${window.currentTextChannel}"]`);
        if (el) {
          el.classList.add('connected');
          const headerText = el.querySelector('.channel-header .channel-name');
          if (headerText) selectedChannelTitle.textContent = headerText.textContent;
          textChannelContainer.style.display = 'flex';
          textChannelContainer.style.flexDirection = 'column';
        }
      }
    });
  }

  micToggleButton.addEventListener('click', () => {
    window.micEnabled = !window.micEnabled;
    window.applyAudioStates();
  });

  deafenToggleButton.addEventListener('click', () => {
    if (!window.selfDeafened) {
      window.micWasEnabledBeforeDeaf = window.micEnabled;
      window.selfDeafened = true;
      window.micEnabled = false;
    } else {
      window.selfDeafened = false;
      if (window.micWasEnabledBeforeDeaf) window.micEnabled = true;
    }
    window.applyAudioStates();
  });

  settingsButton.addEventListener('click', () => {
    if (typeof window.openUserSettings === 'function') {
      window.openUserSettings();
    }
  });

  function sendTextMessage() {
    const overlay = document.getElementById('previewWrapper');
    const captionEl = overlay?.querySelector('.caption-input');
    const overlayVisible = overlay && overlay.style.display !== 'none';
    const msg = overlayVisible ? (captionEl?.value.trim() || '') : textChannelMessageInput.value.trim();
    const atts = getAttachments();
    if (!msg && atts.length === 0) return;

    if (atts.length === 0) {
      socket.emit('textMessage', {
        groupId: window.selectedGroup,
        roomId: window.currentTextChannel,
        message: msg,
        username: window.username,
      });
      textChannelMessageInput.value = '';
      if (captionEl) captionEl.value = '';
      sendTextMessageBtn.style.display = 'none';
      if (micMessageBtn) micMessageBtn.style.display = 'block';
      return;
    }

    const fd = new FormData();
    fd.append('username', window.username || '');
    fd.append('channelId', window.currentTextChannel);
    fd.append('content', msg);
    atts.forEach(a => fd.append('files', a.file));

    const sizes = atts.map(a => a.file.size);
    const offsets = [];
    sizes.reduce((acc, sz, i) => { offsets[i] = acc; return acc + sz; }, 0);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      const loaded = e.loaded;
      sizes.forEach((sz, i) => {
        const start = offsets[i];
        const end = start + sz;
        let pct = 0;
        if (loaded >= end) pct = 100;
        else if (loaded > start) pct = ((loaded - start) / sz) * 100;
        updateAttachmentProgress(i, pct);
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        clearAttachments();
        textChannelMessageInput.value = '';
        if (captionEl) captionEl.value = '';
        if (overlay) overlay.style.display = 'none';
        sendTextMessageBtn.style.display = 'none';
        if (micMessageBtn) micMessageBtn.style.display = 'block';
      } else {
        atts.forEach((_, i) => markAttachmentFailed(i, sendTextMessage));
      }
    };
    xhr.onerror = () => {
      atts.forEach((_, i) => markAttachmentFailed(i, sendTextMessage));
    };
    xhr.open('POST', '/api/message');
    xhr.send(fd);
  }
  sendTextMessageBtn.addEventListener('click', sendTextMessage);
  textChannelMessageInput.addEventListener('input', () =>
    toggleInputIcons(textChannelMessageInput, micMessageBtn, sendTextMessageBtn)
  );
  textChannelMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendTextMessage();
    }
  });

  const captionInput = document.querySelector('#previewWrapper .caption-input');
  if (captionInput) {
    captionInput.addEventListener('input', () => {
      const val = captionInput.value.trim();
      if (val !== '' || getAttachments().length > 0) {
        sendTextMessageBtn.style.display = 'block';
        if (micMessageBtn) micMessageBtn.style.display = 'none';
      } else {
        sendTextMessageBtn.style.display = 'none';
        if (micMessageBtn) micMessageBtn.style.display = 'block';
      }
    });
    captionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendTextMessage();
      }
    });
  }

  if (screenShareButton) {
    screenShareButton.addEventListener('click', async () => {
      if (window.screenShareProducerVideo) {
        await ScreenShare.stopScreenShare(socket);
        screenShareButton.classList.remove('active');
        const smallIcon = screenShareButton.querySelector('.material-icons');
        if (smallIcon) smallIcon.textContent = 'desktop_windows';
        if (screenShareLargeButton) screenShareLargeButton.classList.remove('active');
        if (screenShareLargeButton) {
          const largeIcon = screenShareLargeButton.querySelector('.material-icons, .material-icons-outlined');
          if (largeIcon) {
            largeIcon.textContent = 'desktop_windows';
            largeIcon.classList.add('material-icons');
            largeIcon.classList.remove('material-icons-outlined');
          }
        }
      } else {
        try {
          if (!sendTransport) {
            alert('Ekran paylaşımı için transport henüz hazır değil.');
            return;
          }
          window.clearScreenShareUI();
          await ScreenShare.startScreenShare(sendTransport, socket);
          screenShareButton.classList.add('active');
          const smallIcon = screenShareButton.querySelector('.material-icons');
          if (smallIcon) smallIcon.textContent = 'desktop_access_disabled';
          if (screenShareLargeButton) screenShareLargeButton.classList.add('active');
          if (screenShareLargeButton) {
            const largeIcon = screenShareLargeButton.querySelector('.material-icons, .material-icons-outlined');
          if (largeIcon) {
            largeIcon.textContent = 'desktop_access_disabled';
            largeIcon.classList.remove('material-icons');
            largeIcon.classList.add('material-icons-outlined');
          }
          }
        } catch (error) {
          console.error('Ekran paylaşımı başlatılırken hata:', error);
        }
      }
    });
  }
  if (screenShareLargeButton) {
    screenShareLargeButton.addEventListener('click', async () => {
      if (window.screenShareProducerVideo) {
        await ScreenShare.stopScreenShare(socket);
        screenShareLargeButton.classList.remove('active');
        const largeIcon = screenShareLargeButton.querySelector('.material-icons, .material-icons-outlined');
        if (largeIcon) {
          largeIcon.textContent = 'desktop_windows';
          largeIcon.classList.add('material-icons');
          largeIcon.classList.remove('material-icons-outlined');
        }
        if (screenShareButton) screenShareButton.classList.remove('active');
        if (screenShareButton) {
          const smallIcon = screenShareButton.querySelector('.material-icons');
          if (smallIcon) smallIcon.textContent = 'desktop_windows';
        }
      } else {
        try {
          if (!sendTransport) {
            alert('Ekran paylaşımı için transport henüz hazır değil.');
            return;
          }
          window.clearScreenShareUI();
          await ScreenShare.startScreenShare(sendTransport, socket);
          screenShareLargeButton.classList.add('active');
          const largeIcon = screenShareLargeButton.querySelector('.material-icons, .material-icons-outlined');
          if (largeIcon) {
            largeIcon.textContent = 'desktop_access_disabled';
            largeIcon.classList.remove('material-icons');
            largeIcon.classList.add('material-icons-outlined');
          }
          if (screenShareButton) screenShareButton.classList.add('active');
          if (screenShareButton) {
            const smallIcon = screenShareButton.querySelector('.material-icons');
            if (smallIcon) smallIcon.textContent = 'desktop_access_disabled';
          }
        } catch (error) {
          console.error('Ekran paylaşımı başlatılırken hata:', error);
        }
      }
    });
  }
  if (channelContentArea) {
    channelContentArea.addEventListener('contextmenu', window.showVideoContextMenu);
  }
}
