import * as ScreenShare from './screenShare.js';
import { applyAudioStates } from './audioUtils.js';
import { sendTransport } from './webrtc.js';
import * as Ping from './ping.js';

export function initUIEvents(socket, attemptLogin, attemptRegister) {
  const {
    loginButton,
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
    createChannelBtn,
    toggleDMButton,
    roomPanel,
    rightPanel,
    leaveButton,
    micToggleButton,
    deafenToggleButton,
    settingsButton,
    sendTextMessageBtn,
    textChannelMessageInput,
    screenShareButton,
    screenShareLargeButton,
    channelContentArea,
    selectedChannelTitle,
    textChannelContainer,
  } = window;

  loginButton.addEventListener('click', () => attemptLogin());
  loginUsernameInput.addEventListener('keydown', (e) => e.key === 'Enter' && attemptLogin());
  loginPasswordInput.addEventListener('keydown', (e) => e.key === 'Enter' && attemptLogin());

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
      const name = prompt('Kanal adı:');
      if (name && name.trim() !== '') {
        socket.emit('createChannel', { groupId: window.selectedGroup, name: name.trim() });
      }
      if (groupDropdownMenu) groupDropdownMenu.style.display = 'none';
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
      rightPanel.style.display = 'none';
      selectedChannelBar.style.display = 'none';
      selectedDMBar.style.display = 'flex';
      dmContentArea.style.display = 'flex';
      dmPanel.style.display = 'block';
      toggleDMButton.querySelector('.material-icons').textContent = 'group';
      window.isDMMode = true;
    } else {
      roomPanel.style.display = 'flex';
      channelContentArea.style.display = 'flex';
      rightPanel.style.display = 'flex';
      selectedDMBar.style.display = 'none';
      dmContentArea.style.display = 'none';
      dmPanel.style.display = 'none';
      selectedChannelBar.style.display = 'flex';
      toggleDMButton.querySelector('.material-icons').textContent = 'forum';
      selectedChannelTitle.textContent = 'Kanal Seçilmedi';
      window.isDMMode = false;
    }
  });


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
      Ping.updateStatusPanel(0);
      if (typeof window.hideVoiceSections === 'function') {
        window.hideVoiceSections();
      }
      selectedChannelTitle.textContent = 'Kanal Seçilmedi';
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
      textChannelContainer.style.display = 'none';
      socket.emit('browseGroup', window.currentGroup);
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

  settingsButton.addEventListener('click', () => {});

  function sendTextMessage() {
    const msg = textChannelMessageInput.value.trim();
    if (!msg) return;
    socket.emit('textMessage', {
      groupId: window.selectedGroup,
      roomId: window.currentTextChannel,
      message: msg,
      username: window.username,
    });
    textChannelMessageInput.value = '';
    sendTextMessageBtn.style.display = 'none';
  }
  sendTextMessageBtn.addEventListener('click', sendTextMessage);
  textChannelMessageInput.addEventListener('input', () => {
    if (textChannelMessageInput.value.trim() !== '') {
      sendTextMessageBtn.style.display = 'block';
    } else {
      sendTextMessageBtn.style.display = 'none';
    }
  });
  textChannelMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendTextMessage();
    }
  });

  if (screenShareButton) {
    screenShareButton.addEventListener('click', async () => {
      if (window.screenShareProducerVideo) {
        await ScreenShare.stopScreenShare(socket);
        screenShareButton.classList.remove('active');
        const smallIcon = screenShareButton.querySelector('.material-icons');
        if (smallIcon) smallIcon.textContent = 'desktop_windows';
        if (screenShareLargeButton) screenShareLargeButton.classList.remove('active');
        if (screenShareLargeButton) {
          const largeIcon = screenShareLargeButton.querySelector('.material-icons');
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
            const largeIcon = screenShareLargeButton.querySelector('.material-icons');
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
        const largeIcon = screenShareLargeButton.querySelector('.material-icons');
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
          const largeIcon = screenShareLargeButton.querySelector('.material-icons');
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