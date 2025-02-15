/**************************************
 * textChatClient.js
 * İstemcide (tarayıcıda) yazılı sohbet (text chat) ile ilgili kodlar
 **************************************/
(function() {
  // Yardımcı Fonksiyonlar
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (date >= today) {
      return "Bugün " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (date >= yesterday && date < today) {
      return "Dün " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      const day = ("0" + date.getDate()).slice(-2);
      const month = ("0" + (date.getMonth() + 1)).slice(-2);
      const year = date.getFullYear();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${day}.${month}.${year} ${timeStr}`;
    }
  }
  
  function formatTimeOnly(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  function isDifferentDay(ts1, ts2) {
    const d1 = new Date(ts1);
    const d2 = new Date(ts2);
    return d1.getFullYear() !== d2.getFullYear() ||
           d1.getMonth() !== d2.getMonth() ||
           d1.getDate() !== d2.getDate();
  }
  
  function formatLongDate(timestamp) {
    const date = new Date(timestamp);
    const day = date.getDate();
    const monthNames = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }
  
  function insertDateSeparator(timestamp) {
    const textMessages = document.getElementById('textMessages');
    if (!textMessages) return;
    const separator = document.createElement('div');
    separator.className = 'date-separator';
    separator.innerHTML = `<span class="separator-text">${formatLongDate(timestamp)}</span>`;
    textMessages.appendChild(separator);
  }
  
  // Text Chat Başlangıç
  function initTextChatClient(socket, username) {
    console.log("[initTextChatClient] Başlatıldı. Kullanıcı:", username);
    // DOM referansları
    const textMessages = document.getElementById('textMessages');
    if (!textMessages) {
      console.error("[initTextChatClient] 'textMessages' elementi bulunamadı.");
      return;
    }
    const textChannelMessageInput = document.getElementById('textChannelMessageInput');
    const sendTextMessageBtn = document.getElementById('sendTextMessageBtn');
  
    // Gelen mesaj geçmişi (textHistory)
    socket.on('textHistory', (messages) => {
      console.log("[textHistory] Gelen mesaj sayısı:", messages ? messages.length : 0);
      if (!textMessages) {
        console.error("[textHistory] textMessages elementi bulunamadı.");
        return;
      }
      textMessages.innerHTML = "";
      if (!messages || messages.length === 0) {
        console.log("[textHistory] Mesaj geçmişi boş.");
        return;
      }
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        // Gün ayracı ekle
        if (i === 0 || isDifferentDay(messages[i - 1].timestamp, msg.timestamp)) {
          insertDateSeparator(msg.timestamp);
        }
        const time = formatTimestamp(msg.timestamp);
        const sender = (msg.user && msg.user.username) ? msg.user.username : "Anon";
        const isFirst = (
          i === 0 ||
          ((messages[i - 1].user && messages[i - 1].user.username) !== sender) ||
          isDifferentDay(messages[i - 1].timestamp, msg.timestamp)
        );
        const isLast = (
          i === messages.length - 1 ||
          ((messages[i + 1] && messages[i + 1].user && messages[i + 1].user.username) !== sender)
        );
        let className = 'text-message ';
        className += (sender === username) ? 'sent-message ' : 'received-message ';
        className += isFirst ? 'first-message ' : 'subsequent-message ';
        if (isLast) { className += 'last-message'; }
        const msgDiv = document.createElement('div');
        msgDiv.className = className;
        msgDiv.setAttribute('data-timestamp', msg.timestamp);
        msgDiv.setAttribute('data-sender', sender);
        if (sender === username) {
          if (isFirst) {
            msgDiv.innerHTML = `
              <div class="message-content with-timestamp">
                <span class="own-timestamp">${time}</span> ${msg.content}
              </div>`;
          } else {
            msgDiv.innerHTML = `
              <div class="message-content without-timestamp">
                ${msg.content}
                <span class="timestamp-hover">${formatTimeOnly(msg.timestamp)}</span>
              </div>`;
          }
        } else {
          if (isFirst) {
            const avatarHTML = `<div class="message-avatar profile-thumb">
              ${sender.charAt(0).toUpperCase()}
            </div>`;
            msgDiv.innerHTML = `
              ${avatarHTML}
              <div class="message-content with-avatar">
                <span class="sender-name">${sender}</span>
                <span class="timestamp">${time}</span><br>
                ${msg.content}
              </div>`;
          } else {
            const avatarPlaceholder = `<div class="message-avatar placeholder"></div>`;
            msgDiv.innerHTML = `
              ${avatarPlaceholder}
              <div class="message-content without-avatar">
                ${msg.content}
                <span class="timestamp-hover">${formatTimeOnly(msg.timestamp)}</span>
              </div>`;
          }
        }
        textMessages.appendChild(msgDiv);
      }
      textMessages.scrollTop = textMessages.scrollHeight;
    });
  
    // Gelen yeni mesajlar (newTextMessage)
    socket.on('newTextMessage', (data) => {
      console.log("[newTextMessage] Gelen veri:", data);
      const { channelId, message: msg } = data;
      if (!textMessages) return;
      let lastMsgDiv = textMessages.lastElementChild;
      while (lastMsgDiv && lastMsgDiv.classList.contains('date-separator')) {
        lastMsgDiv = lastMsgDiv.previousElementSibling;
      }
      if (!lastMsgDiv) {
        insertDateSeparator(msg.timestamp);
      } else {
        const lastMsgTime = lastMsgDiv.getAttribute('data-timestamp');
        if (lastMsgTime && isDifferentDay(lastMsgTime, msg.timestamp)) {
          insertDateSeparator(msg.timestamp);
        }
      }
      const time = formatTimestamp(msg.timestamp);
      const sender = msg.username || "Anon";
      const isFirst = (
        !lastMsgDiv ||
        (lastMsgDiv.getAttribute('data-sender') !== sender) ||
        (lastMsgDiv.getAttribute('data-timestamp') && isDifferentDay(lastMsgDiv.getAttribute('data-timestamp'), msg.timestamp))
      );
      if (lastMsgDiv && lastMsgDiv.getAttribute('data-sender') === sender) {
        lastMsgDiv.classList.remove('last-message');
      }
      let className = 'text-message ';
      className += (sender === username) ? 'sent-message ' : 'received-message ';
      className += isFirst ? 'first-message ' : 'subsequent-message ';
      className += 'last-message';
      const msgDiv = document.createElement('div');
      msgDiv.className = className;
      msgDiv.setAttribute('data-timestamp', msg.timestamp);
      msgDiv.setAttribute('data-sender', sender);
      if (sender === username) {
        if (isFirst) {
          msgDiv.innerHTML = `
            <div class="message-content with-timestamp">
              <span class="own-timestamp">${time}</span> ${msg.content}
            </div>`;
        } else {
          msgDiv.innerHTML = `
            <div class="message-content without-timestamp">
              ${msg.content}
              <span class="timestamp-hover">${formatTimeOnly(msg.timestamp)}</span>
            </div>`;
        }
      } else {
        if (isFirst) {
          const avatarHTML = `<div class="message-avatar profile-thumb">
            ${sender.charAt(0).toUpperCase()}
          </div>`;
          msgDiv.innerHTML = `
            ${avatarHTML}
            <div class="message-content with-avatar">
              <span class="sender-name">${sender}</span>
              <span class="timestamp">${time}</span><br>
              ${msg.content}
            </div>`;
        } else {
          const avatarPlaceholder = `<div class="message-avatar placeholder"></div>`;
          msgDiv.innerHTML = `
            ${avatarPlaceholder}
            <div class="message-content without-avatar">
              ${msg.content}
              <span class="timestamp-hover">${formatTimeOnly(msg.timestamp)}</span>
            </div>`;
        }
      }
      textMessages.appendChild(msgDiv);
      textMessages.scrollTop = textMessages.scrollHeight;
    });
  
    // Mesaj gönderme fonksiyonu (sendTextMessage)
    function sendTextMessage() {
      const msg = textChannelMessageInput.value.trim();
      if (!msg) return;
      const roomId = window.currentTextChannel;
      const groupId = window.selectedGroup || null;
      console.log("[sendTextMessage] Gönderiliyor:", { groupId, roomId, message: msg, username });
      // Kendi mesajımızı ekrana ekleyelim
      appendOwnMessage(msg);
      // Sunucuya mesajı gönderiyoruz
      socket.emit('textMessage', {
        groupId,
        roomId,
        message: msg,
        username
      });
      textChannelMessageInput.value = '';
      sendTextMessageBtn.style.display = "none";
    }
  
    function appendOwnMessage(msg) {
      if (!textMessages) return;
      let lastMsgDiv = textMessages.lastElementChild;
      while (lastMsgDiv && lastMsgDiv.classList.contains('date-separator')) {
        lastMsgDiv = lastMsgDiv.previousElementSibling;
      }
      const now = new Date();
      if (!lastMsgDiv) {
        insertDateSeparator(now);
      } else {
        const lastMsgTime = lastMsgDiv.getAttribute('data-timestamp');
        if (lastMsgTime && isDifferentDay(lastMsgTime, now)) {
          insertDateSeparator(now);
        }
      }
      const time = formatTimestamp(now);
      const timeOnly = formatTimeOnly(now);
      const sender = username;
      const isFirst = (
        !lastMsgDiv ||
        lastMsgDiv.getAttribute('data-sender') !== sender ||
        (lastMsgDiv.getAttribute('data-timestamp') && isDifferentDay(lastMsgDiv.getAttribute('data-timestamp'), now))
      );
      if (lastMsgDiv && lastMsgDiv.getAttribute('data-sender') === sender) {
        lastMsgDiv.classList.remove('last-message');
      }
      let className = 'text-message sent-message ';
      className += isFirst ? 'first-message ' : 'subsequent-message ';
      className += 'last-message';
      const msgDiv = document.createElement('div');
      msgDiv.className = className;
      msgDiv.setAttribute('data-timestamp', now);
      msgDiv.setAttribute('data-sender', sender);
      if (isFirst) {
        msgDiv.innerHTML = `
          <div class="message-content with-timestamp">
            <span class="own-timestamp">${time}</span> ${msg}
          </div>`;
      } else {
        msgDiv.innerHTML = `
          <div class="message-content without-timestamp">
            ${msg}
            <span class="timestamp-hover">${timeOnly}</span>
          </div>`;
      }
      textMessages.appendChild(msgDiv);
      textMessages.scrollTop = textMessages.scrollHeight;
    }
  
    if (sendTextMessageBtn) {
      sendTextMessageBtn.addEventListener('click', sendTextMessage);
    }
    if (textChannelMessageInput) {
      textChannelMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendTextMessage();
        }
      });
      textChannelMessageInput.addEventListener('input', () => {
        if (textChannelMessageInput.value.trim() !== "") {
          sendTextMessageBtn.style.display = "block";
        } else {
          sendTextMessageBtn.style.display = "none";
        }
      });
    }
  }
  
  window.initTextChatClient = initTextChatClient;
})();
