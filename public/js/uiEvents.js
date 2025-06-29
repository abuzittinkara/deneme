import * as ScreenShare from './screenShare.js';
import { applyAudioStates } from './audioUtils.js';
import { sendTransport } from './webrtc.js';
import * as Ping from './ping.js';
import { getAttachments, clearAttachments, updateAttachmentProgress, markAttachmentFailed } from './attachments.js';
import { toggleInputIcons, getInputText, clearInput } from './uiHelpers.js';
import * as Mentions from './mentions.js';

export function initUIEvents(socket) {
  const {
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
    createCategoryBtn,
    categoryModal,
    modalCategoryName,
    modalCreateCategoryBtn,
    modalCloseCategoryBtn,
    createChannelTargetCategory,
  } = window;

  // ensure this helper value exists for later use
  window.createChannelTargetCategory ??= null;

  Mentions.initMentions(socket);

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
      window.createChannelTargetCategory = null;
      if (roomModal) {
        roomModal.style.display = 'flex';
        roomModal.classList.add('active');
      }
      if (groupDropdownMenu) groupDropdownMenu.style.display = 'none';
    });
  }

  if (createCategoryBtn) {
    createCategoryBtn.addEventListener('click', () => {
      if (categoryModal) {
        categoryModal.style.display = 'flex';
        categoryModal.classList.add('active');
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

  if (modalCloseCategoryBtn) {
    modalCloseCategoryBtn.addEventListener('click', () => {
      if (categoryModal) {
        categoryModal.style.display = 'none';
        categoryModal.classList.remove('active');
      }
    });
  }

  if (modalCreateRoomBtn) {
    modalCreateRoomBtn.addEventListener('click', () => {
      const name = modalRoomName ? modalRoomName.value.trim() : '';
      if (!name) return;
      const type = voiceChannel && voiceChannel.checked ? 'voice' : 'text';
      socket.emit('createChannel', { groupId: window.selectedGroup, name, type, categoryId: window.createChannelTargetCategory });
      window.createChannelTargetCategory = null;
      modalRoomName.value = '';
      if (roomModal) {
        roomModal.style.display = 'none';
        roomModal.classList.remove('active');
      }
    });
  }

  if (modalCreateCategoryBtn) {
    modalCreateCategoryBtn.addEventListener('click', () => {
      const name = modalCategoryName ? modalCategoryName.value.trim() : '';
      if (!name) return;
      socket.emit('createCategory', { groupId: window.selectedGroup, name });
      modalCategoryName.value = '';
      if (categoryModal) {
        categoryModal.style.display = 'none';
        categoryModal.classList.remove('active');
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

  // DM panel toggle is now controlled by React

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

  // Text mesaj gönderimi artık React TextChannel bileşeninde yönetiliyor

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
