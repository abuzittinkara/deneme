// public/js/dmChat.js
// Bu modül, DM sohbet işlevini aktif hale getirmek için gerekli tüm UI ve event işleyicilerini içerir.
// Grup metin kanallarındaki sohbet işlevselliğine benzer şekilde, DM sohbet ekranı oluşturur,
// mesaj geçmişini yükler ve yeni mesajların gönderilmesini sağlar.

import { renderTextMessages, appendNewMessage, insertDateSeparator, isDifferentDay } from './textChannel.js';

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

  // DM mesaj gönderme alanı (textChatInputBar)
  const textChatInputBar = document.createElement('div');
  textChatInputBar.id = 'dmTextChatInputBar';
  textChatInputBar.className = 'text-chat-input-bar';
  const chatInputWrapper = document.createElement('div');
  chatInputWrapper.className = 'chat-input-wrapper';
  const dmInput = document.createElement('input');
  dmInput.type = 'text';
  dmInput.id = 'dmMessageInput';
  dmInput.className = 'chat-input';
  dmInput.placeholder = 'Bir mesaj yazın...';
  const sendButton = document.createElement('span');
  sendButton.id = 'dmSendButton';
  sendButton.className = 'material-icons send-icon';
  sendButton.textContent = 'send';
  chatInputWrapper.appendChild(dmInput);
  chatInputWrapper.appendChild(sendButton);
  textChatInputBar.appendChild(chatInputWrapper);
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
        sendButton.style.display = 'none';
      } else {
        alert('Mesaj gönderilemedi.');
      }
    });
  }

  sendButton.addEventListener('click', sendDM);
  dmInput.addEventListener('input', () => {
    if (dmInput.value.trim() !== '') {
      sendButton.style.display = 'block';
    } else {
      sendButton.style.display = 'none';
    }
  });
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
    }
  });
}