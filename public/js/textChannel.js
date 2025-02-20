/**************************************
 * public/js/textChannel.js
 * Metin (mesaj) kanallarıyla ilgili tüm fonksiyonlar burada toplanmıştır.
 **************************************/

// Global olarak her kanal için son mesaj bilgisini saklayan obje
let lastMessageInfo = {};

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

// Yalnızca saat bilgisini döndüren yardımcı fonksiyon (hh:mm formatında)
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// Mesajı, tam header (avatar, kullanıcı adı ve zaman) şeklinde render eder.
// Bu fonksiyonda header, tam zaman bilgisini (formatTimestamp ile) gösteriyor.
function renderFullMessage(msg, sender, time, msgClass) {
  return `
    <div class="message-item">
      <div class="message-header">
        <div class="message-avatar-container">
          <img class="message-avatar" src="/images/default-avatar.png" alt="">
        </div>
        <div class="sender-info">
          <span class="sender-name">${sender}</span>
          <span class="timestamp">${time}</span>
        </div>
      </div>
      <div class="message-content ${msgClass}">${msg.content}</div>
    </div>
  `;
}

// Sadece mesaj içeriğini render eder (header olmadan).
// Bu durumda mesajın solunda hover ile gösterilecek saat bilgisi için .hover-time elementi eklenir.
// Güncelleme: hover-time kısmında yalnızca saat bilgisi gösterilsin.
function renderContentOnly(msg, msgClass, timestamp) {
  return `
    <div class="message-item" style="position: relative;">
      <span class="hover-time">${formatTime(timestamp)}</span>
      <div class="message-content ${msgClass}" style="margin-left: 48px;">${msg.content}</div>
    </div>
  `;
}

// Verilen mesaj listesini container içerisine render eder.
// Mesajlar, ardışık aynı göndericiler için "only-message", "first-message", "middle-message" ve "last-message" sınıflarıyla ayrılır.
function renderTextMessages(messages, container) {
  container.innerHTML = "";
  // Kanal ID'sine göre, mesaj geçmişi yeniden renderlansa da global state sıfırlanmasın.
  const channelId = container.dataset.channelId;
  // Eğer o kanala ait global bilgi yoksa oluşturuyoruz, yoksa koruyoruz:
  if (!lastMessageInfo[channelId]) {
    lastMessageInfo[channelId] = null;
  }
  
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
      msgHTML = renderContentOnly(msg, msgClass, msg.timestamp);
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-message left-message';
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
    
    // Global last message bilgisini güncelle
    lastMessageInfo[channelId] = { sender, timestamp: new Date(msg.timestamp) };
  });
  container.scrollTop = container.scrollHeight;
}

// Yeni gelen mesajı, global lastMessageInfo üzerinden (kanala ait) tespit ederek render eder.
function appendNewMessage(msg, container) {
  const channelId = container.dataset.channelId;
  const sender = msg.username || "Anon";
  // Farklı bir formatlama fonksiyonu kullanmayıp yalnızca hover için zaman bilgisini ayrı hesaplıyoruz.
  const fullTime = formatTimestamp(msg.timestamp);
  
  let lastInfo = lastMessageInfo[channelId];
  let msgClass = "";
  if (!lastInfo || lastInfo.sender !== sender || isDifferentDay(lastInfo.timestamp, msg.timestamp)) {
    // Farklı gönderici ya da farklı gün: yeni blok
    if (lastInfo && isDifferentDay(lastInfo.timestamp, msg.timestamp)) {
      insertDateSeparator(container, msg.timestamp);
    }
    msgClass = "only-message";
  } else {
    msgClass = "last-message";
    // Aynı blok içindeyse, DOM üzerinden son mesajı bulup sınıfını güncelleyelim:
    let lastMsgElem = container.lastElementChild;
    while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
      lastMsgElem = lastMsgElem.previousElementSibling;
    }
    if (lastMsgElem) {
      const lastContent = lastMsgElem.querySelector('.message-content');
      if (lastContent) {
        if (lastContent.classList.contains("only-message")) {
          lastContent.classList.remove("only-message");
          lastContent.classList.add("first-message");
        } else if (lastContent.classList.contains("last-message")) {
          lastContent.classList.remove("last-message");
          lastContent.classList.add("middle-message");
        }
      }
    }
  }
  
  let msgHTML = "";
  if (msgClass === "only-message" || msgClass === "first-message") {
    msgHTML = renderFullMessage(msg, sender, fullTime, msgClass);
  } else {
    msgHTML = renderContentOnly(msg, msgClass, msg.timestamp);
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'text-message left-message';
  msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
  msgDiv.setAttribute('data-sender', sender);
  msgDiv.innerHTML = msgHTML;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  
  // Global son mesaj bilgisini güncelle
  lastMessageInfo[channelId] = { sender, timestamp: new Date(msg.timestamp) };
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
      // Mesajlar arasında tarih ayıracı kontrolü:
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
