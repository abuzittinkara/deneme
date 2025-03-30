// public/js/dmChat.js
// Bu modül, DM sohbet işlevini aktif hale getirmek için gerekli tüm UI ve event işleyicilerini içerir.
// Grup metin kanallarındaki sohbet işlevselliğine benzer şekilde, DM sohbet ekranı oluşturur,
// mesaj geçmişini yükler ve yeni mesajların gönderilmesini sağlar.

export function initDMChat(socket, friendUsername) {
  // dmContentArea'yı al veya oluştur
  let dmContentArea = document.getElementById('dmContentArea');
  if (!dmContentArea) {
    dmContentArea = document.createElement('div');
    dmContentArea.id = 'dmContentArea';
    dmContentArea.style.display = 'block';
    dmContentArea.style.width = '100%';
    dmContentArea.style.marginLeft = '0';
    dmContentArea.style.marginTop = '0';
    dmContentArea.style.height = 'calc(100% - 50px)'; // Üstteki dmChannelTitle yüksekliği 50px varsayılıyor
    dmContentArea.style.padding = '0.75rem 1rem';
    dmContentArea.style.boxSizing = 'border-box';
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
  dmMessages.style.height = 'calc(100% - 60px)'; // Input alanı için yer bırakıyoruz
  dmMessages.style.overflowY = 'auto';
  dmMessages.style.padding = '0.5rem';
  dmContentArea.appendChild(dmMessages);

  // DM mesaj gönderme alanı (input + gönder butonu)
  const inputContainer = document.createElement('div');
  inputContainer.id = 'dmInputContainer';
  inputContainer.style.display = 'flex';
  inputContainer.style.alignItems = 'center';
  inputContainer.style.marginTop = '10px';
  const dmInput = document.createElement('input');
  dmInput.type = 'text';
  dmInput.id = 'dmMessageInput';
  dmInput.placeholder = 'Mesaj yazın...';
  dmInput.style.flex = '1';
  dmInput.style.padding = '0.5rem';
  const sendButton = document.createElement('button');
  sendButton.id = 'dmSendButton';
  sendButton.textContent = 'Gönder';
  inputContainer.appendChild(dmInput);
  inputContainer.appendChild(sendButton);
  dmContentArea.appendChild(inputContainer);

  // Fonksiyon: Gelen bir DM mesajını ekler
  function appendDMMessage(container, msg) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'dm-message';
    msgDiv.style.marginBottom = '8px';
    msgDiv.textContent = `${msg.username}: ${msg.content}`;
    container.appendChild(msgDiv);
  }

  // DM geçmişini yükle: joinDM event'i ile sunucudan geçmiş mesajları alıyoruz.
  socket.emit('joinDM', { friend: friendUsername }, (res) => {
    if (res.success && res.messages) {
      dmMessages.innerHTML = '';
      res.messages.forEach(msg => {
        appendDMMessage(dmMessages, msg);
      });
      dmMessages.scrollTop = dmMessages.scrollHeight;
    } else {
      dmMessages.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
    }
  });

  // Yeni mesaj gönderme işlevi
  function sendDM() {
    const content = dmInput.value.trim();
    if (!content) return;
    // dmMessage event'i ile mesajı gönderiyoruz.
    socket.emit('dmMessage', { friend: friendUsername, content: content }, (ack) => {
      if (ack && ack.success) {
        // Kendi mesajımızı hemen ekleyelim.
        appendDMMessage(dmMessages, { username: 'Sen', content: content });
        dmInput.value = '';
        dmMessages.scrollTop = dmMessages.scrollHeight;
      } else {
        alert('Mesaj gönderilemedi.');
      }
    });
  }

  sendButton.addEventListener('click', sendDM);
  dmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendDM();
    }
  });

  // Sunucudan gelen yeni DM mesajlarını dinle.
  socket.on('newDMMessage', (data) => {
    // data.friend ile mevcut DM konuşması eşleşiyorsa mesajı ekle
    if (data.friend === friendUsername && data.message) {
      appendDMMessage(dmMessages, data.message);
      dmMessages.scrollTop = dmMessages.scrollHeight;
    }
  });
}
