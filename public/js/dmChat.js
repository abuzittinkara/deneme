// public/js/dmChat.js
// Bu modül, DM sohbet işlevini aktif hale getirmek için gerekli tüm UI ve event işleyicilerini içerir.
// Grup metin kanallarındaki sohbet işlevselliğine benzer şekilde, DM sohbet ekranı oluşturur,
// mesaj geçmişini yükler ve yeni mesajların gönderilmesini sağlar.

import { renderTextMessages, appendNewMessage, insertDateSeparator, isDifferentDay, removeMessageElement, updateMessageClasses } from './textChannel.js';
import { showProfilePopout } from './profilePopout.js';
import { toggleInputIcons } from "./uiHelpers.js";

export function initDMChat(socket, friendUsername) {
  // dmContentArea'yı al veya oluştur
  let dmContentArea = document.getElementById('dmContentArea');
  if (!dmContentArea) {
    dmContentArea = document.createElement('div');
    dmContentArea.id = 'dmContentArea';
    dmContentArea.className = 'text-channel-container';
    const selectedDMBar = document.getElementById('selectedDMBar');
    if (selectedDMBar) {
      selectedDMBar.parentNode.insertBefore(dmContentArea, selectedDMBar.nextSibling);
    } else {
      document.body.appendChild(dmContentArea);
    }
  }
  dmContentArea.innerHTML = '';

  // DM mesajlarını görüntüleyecek alanı oluşturuyoruz
  const dmMessages = document.createElement('div');
  dmMessages.id = 'dmMessages';
  dmMessages.dataset.channelId = `dm-${friendUsername}`;
  dmContentArea.appendChild(dmMessages);

  dmMessages.addEventListener('click', (e) => {
    const avatar = e.target.closest('.message-avatar');
    const nameEl = e.target.closest('.sender-name');
    const del = e.target.closest('.delete-icon');
    if (avatar) {
      const uname = avatar.dataset.username;
      if (uname) showProfilePopout(uname, e);
    } else if (nameEl) {
      showProfilePopout(nameEl.textContent.trim(), e);
    } else if (del) {
      const msgEl = del.closest('.text-message');
      if (msgEl) {
        socket.emit('deleteDMMessage', { friend: friendUsername, messageId: msgEl.dataset.id });
        removeMessageElement(dmMessages, msgEl.dataset.id);
        updateMessageClasses(dmMessages);
      }
    }
  });
  
  // DM mesaj girişi için mevcut textChatInputBar yapısını klonla
  const baseInputBar = document.getElementById('textChatInputBar');
  let textChatInputBar;
  let dmInput;
  let sendButton;
  let micButton;
  if (baseInputBar) {
    textChatInputBar = baseInputBar.cloneNode(true);
    textChatInputBar.id = 'dmTextChatInputBar';
    textChatInputBar.classList.add('text-chat-input-bar');
    dmInput = textChatInputBar.querySelector('#textChannelMessageInput');
    if (dmInput) {
      dmInput.id = 'dmMessageInput';
    }
    sendButton = textChatInputBar.querySelector('#sendTextMessageBtn');
    if (sendButton) {
      sendButton.id = 'dmSendButton';
      sendButton.classList.remove('material-icons');
      sendButton.innerHTML = '<span class="material-icons">send</span>';
    }
    micButton = textChatInputBar.querySelector('#micMessageBtn');
    if (micButton) {
      micButton.id = 'dmMicMessageBtn';
    }
  } else {
    // Fallback: yapıyı manuel olarak oluştur
    textChatInputBar = document.createElement('div');
    textChatInputBar.id = 'dmTextChatInputBar';
    textChatInputBar.className = 'text-chat-input-bar';
    const chatInputWrapper = document.createElement('div');
    chatInputWrapper.className = 'chat-input-wrapper';

    const attachBtn = document.createElement('button');
    attachBtn.id = 'attachBtn';
    attachBtn.className = 'icon-btn';
    attachBtn.type = 'button';
    attachBtn.innerHTML = '<span class="material-icons">add</span>';

    const fileInput = document.createElement('input');
    fileInput.id = 'attachFileInput';
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.hidden = true;

    const mediaInput = document.createElement('input');
    mediaInput.id = 'attachMediaInput';
    mediaInput.type = 'file';
    mediaInput.accept = 'image/*,video/*';
    mediaInput.multiple = true;
    mediaInput.hidden = true;

    const audioInput = document.createElement('input');
    audioInput.id = 'attachAudioInput';
    audioInput.type = 'file';
    audioInput.accept = 'audio/*';
    audioInput.multiple = true;
    audioInput.hidden = true;

    const gifInput = document.createElement('input');
    gifInput.id = 'attachGifInput';
    gifInput.type = 'file';
    gifInput.accept = 'image/gif';
    gifInput.multiple = true;
    gifInput.hidden = true;
    
    dmInput = document.createElement('input');
    dmInput.type = 'text';
    dmInput.id = 'dmMessageInput';
    dmInput.className = 'chat-input';
    dmInput.placeholder = 'Bir mesaj yazın...';
    
    micButton = document.createElement('span');
    micButton.id = 'dmMicMessageBtn';
    micButton.className = 'mic-icon';
    micButton.textContent = 'mic';

    sendButton = document.createElement('span');
    sendButton.id = 'dmSendButton';
    sendButton.className = 'send-icon';
    sendButton.innerHTML = '<span class="material-icons">send</span>';
    
    chatInputWrapper.appendChild(attachBtn);
    chatInputWrapper.appendChild(fileInput);
    chatInputWrapper.appendChild(mediaInput);
    chatInputWrapper.appendChild(audioInput);
    chatInputWrapper.appendChild(gifInput);
    chatInputWrapper.appendChild(dmInput);
    chatInputWrapper.appendChild(micButton);
    chatInputWrapper.appendChild(sendButton);
    textChatInputBar.appendChild(chatInputWrapper);
  }

  dmContentArea.appendChild(textChatInputBar);

  // Mesajı tarih ayıracı kontrolüyle ekler
  function addDMMessage(msg) {
    let lastElement = dmMessages.lastElementChild;
    let lastTimestamp = null;
    if (lastElement && lastElement.classList.contains('date-separator')) {
      lastTimestamp = lastElement.getAttribute('data-timestamp');
    } else {
      let lastMsgElem = dmMessages.lastElementChild;
      while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
        lastMsgElem = lastMsgElem.previousElementSibling;
      }
      if (lastMsgElem) {
        lastTimestamp = lastMsgElem.getAttribute('data-timestamp');
      }
    }
    if (!lastTimestamp || isDifferentDay(lastTimestamp, msg.timestamp)) {
      insertDateSeparator(dmMessages, msg.timestamp);
    }
    appendNewMessage(msg, dmMessages);
  }

  // DM odasına katıl ve mesaj geçmişini iste
  socket.emit('joinDM', { friend: friendUsername }, (res) => {
    if (res && res.success) {
      socket.emit('getDMMessages', { friend: friendUsername }, (msgRes) => {
        if (msgRes.success && msgRes.messages) {
          dmMessages.innerHTML = '';
          const formatted = msgRes.messages.map(m => ({
            id: m.id || m._id,
            content: m.content,
            timestamp: m.timestamp,
            user: { username: m.username }
          }));
          renderTextMessages(formatted, dmMessages);
        } else {
          dmMessages.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
        }
      });
    } else {
      dmMessages.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
    }
  });

  // Yeni mesaj gönderme işlevi
  function sendDM() {
    const content = dmInput.value.trim();
    if (!content) return;
    socket.emit('dmMessage', { friend: friendUsername, content }, (ack) => {
      if (ack && ack.success) {
        dmInput.value = '';
        toggleInputIcons(dmInput, micButton, sendButton);
      } else {
        alert('Mesaj gönderilemedi.');
      }
    });
  }

  sendButton.addEventListener('click', sendDM);
  dmInput.addEventListener('input', () =>
    toggleInputIcons(dmInput, micButton, sendButton)
  );
  dmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendDM();
    }
  });

  // Sunucudan gelen yeni DM mesajlarını dinle.
  socket.on('newDMMessage', (data) => {
    if (data.friend === friendUsername && data.message) {
      addDMMessage(data.message);
      const atts = Array.isArray(data.message.attachments)
        ? data.message.attachments.map(a => a.url).filter(u => u && u.startsWith('/uploads/'))
        : [];
      if (atts.length && window.cacheUploadUrls) {
        window.cacheUploadUrls(atts);
      }
    }
  });
  socket.on('dmMessageDeleted', ({ messageId }) => {
    removeMessageElement(dmMessages, messageId);
    updateMessageClasses(dmMessages);
  });
}