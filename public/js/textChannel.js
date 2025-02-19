/**************************************
 * public/js/textChannel.js
 * Metin (mesaj) kanallarıyla ilgili tüm fonksiyonlar burada toplanmıştır.
 **************************************/

// İki timestamp'in gün bazında farklı olup olmadığını kontrol eder.
function isDifferentDay(ts1, ts2) {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() !== d2.getFullYear() ||
         d1.getMonth() !== d2.getMonth() ||
         d1.getDate() !== d2.getDate();
}

// Belirtilen timestamp'i "Bugün HH:MM", "Dün HH:MM" veya "DD.MM.YYYY HH:MM" formatında döndürür.
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

// Uzun tarih formatında (örneğin, "19 Ocak 2025") döndüren fonksiyon.
function formatLongDate(timestamp) {
  const date = new Date(timestamp);
  const day = date.getDate();
  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

// Belirtilen container'a, verilen timestamp için tarih ayırıcı ekler.
// Ayırıcı, tüm genişliği kaplayan yatay çizgi şeklinde olup ortasında uzun formatta tarih metni bulunur.
function insertDateSeparator(container, timestamp) {
  const separator = document.createElement('div');
  separator.className = 'date-separator';
  separator.innerHTML = `<span class="separator-text">${formatLongDate(timestamp)}</span>`;
  container.appendChild(separator);
}

// Mesajı, tam header (avatar + kullanıcı adı + zaman) şeklinde render eder.
// "msgClass" parametresi, inner .message-content elemanına eklenir.
function renderFullMessage(msg, sender, time, msgClass) {
  return `
    <div class="message-item">
      <div class="message-header">
        <div class="avatar-and-name">
          <img class="message-avatar" src="/images/default-avatar.png" alt="">
          <span class="sender-name">${sender}</span>
        </div>
        <span class="timestamp">${time}</span>
      </div>
      <div class="message-content ${msgClass}">${msg.content}</div>
    </div>
  `;
}

// Sadece mesaj içeriğini render eder (header olmadan).
// "msgClass" parametresi, inner .message-content elemanına eklenir.
function renderContentOnly(msg, msgClass) {
  return `
    <div class="message-item">
      <div class="message-content ${msgClass}" style="margin-left: 48px;">${msg.content}</div>
    </div>
  `;
}

// Verilen mesaj listesini container içerisine render eder.
// Mesajlar, ardışık aynı göndericiler için "only-message", "first-message", "middle-message" ve "last-message" sınıflarıyla ayrılır.
function renderTextMessages(messages, container) {
  container.innerHTML = "";
  messages.forEach((msg, index) => {
    const sender = (msg.user && msg.user.username) ? msg.user.username : "Anon";
    const time = formatTimestamp(msg.timestamp);
    let msgClass = "";
    
    // Blok başlangıcını belirle:
    const isFirstInBlock = (index === 0) ||
      ((messages[index - 1].user && messages[index - 1].user.username) !== sender) ||
      isDifferentDay(messages[index - 1].timestamp, msg.timestamp);
    // Blok sonunu belirle:
    const isLastInBlock = (index === messages.length - 1) ||
      ((messages[index + 1].user && messages[index + 1].user.username) !== sender) ||
      isDifferentDay(msg.timestamp, messages[index + 1].timestamp);
    
    if (isFirstInBlock && isLastInBlock) {
      msgClass = "only-message";
    } else if (isFirstInBlock) {
      msgClass = "first-message";
    } else if (isLastInBlock) {
      msgClass = "last-message";
    } else {
      msgClass = "middle-message";
    }
    
    let msgHTML = "";
    if (isFirstInBlock) {
      msgHTML = renderFullMessage(msg, sender, time, msgClass);
    } else {
      msgHTML = renderContentOnly(msg, msgClass);
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-message left-message';
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
  });
  container.scrollTop = container.scrollHeight;
}

// Yeni gelen mesajı, container'daki son mesajla karşılaştırarak render eder.
// Mevcut son mesajın gönderici ve timestamp bilgisine göre, yeni mesajın hangi sınıfa ait olacağını belirler.
function appendNewMessage(msg, container) {
  const sender = msg.username || "Anon";
  const time = formatTimestamp(msg.timestamp);
  
  let lastMsgElem = container.lastElementChild;
  while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
    lastMsgElem = lastMsgElem.previousElementSibling;
  }
  
  let msgClass = "";
  if (!lastMsgElem) {
    insertDateSeparator(container, msg.timestamp);
    msgClass = "only-message";
  } else {
    const lastSender = lastMsgElem.getAttribute('data-sender');
    const lastTimestamp = new Date(lastMsgElem.getAttribute('data-timestamp'));
    if (lastSender !== sender || isDifferentDay(lastTimestamp, msg.timestamp)) {
      if (isDifferentDay(lastTimestamp, msg.timestamp)) {
         insertDateSeparator(container, msg.timestamp);
      }
      msgClass = "only-message";
    } else {
      // Aynı blok içinde, önceki mesajın sınıfını güncelleyelim:
      if (lastMsgElem.querySelector('.message-content').classList.contains("only-message")) {
        lastMsgElem.querySelector('.message-content').classList.remove("only-message");
        lastMsgElem.querySelector('.message-content').classList.add("first-message");
      } else if (lastMsgElem.querySelector('.message-content').classList.contains("last-message")) {
        lastMsgElem.querySelector('.message-content').classList.remove("last-message");
        lastMsgElem.querySelector('.message-content').classList.add("middle-message");
      }
      msgClass = "last-message";
    }
  }
  
  let msgHTML = "";
  if (msgClass === "only-message" || msgClass === "first-message") {
    msgHTML = renderFullMessage(msg, sender, time, msgClass);
  } else {
    msgHTML = renderContentOnly(msg, msgClass);
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'text-message left-message';
  msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
  msgDiv.setAttribute('data-sender', sender);
  msgDiv.innerHTML = msgHTML;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Socket üzerinden gelen "textHistory" ve "newTextMessage" eventlerini işleyip,
// ilgili container'a mesajları render eder.
function initTextChannelEvents(socket, container) {
  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
  });

  socket.on('newTextMessage', (data) => {
    if (data.channelId === container.dataset.channelId) {
      const msg = data.message;
      let lastMsgElem = container.lastElementChild;
      while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
        lastMsgElem = lastMsgElem.previousElementSibling;
      }
      if (!lastMsgElem) {
        insertDateSeparator(container, msg.timestamp);
      } else {
        const prevTimestampStr = lastMsgElem.getAttribute('data-timestamp');
        if (isDifferentDay(new Date(prevTimestampStr), new Date(msg.timestamp))) {
          insertDateSeparator(container, msg.timestamp);
        }
      }
      appendNewMessage(msg, container);
    }
  });
}

export { isDifferentDay, formatTimestamp, formatLongDate, insertDateSeparator, renderTextMessages, initTextChannelEvents, appendNewMessage };
