/**************************************
 * public/js/textChannel.js
 * Metin (mesaj) kanallarıyla ilgili tüm fonksiyonlar burada toplanmıştır.
 **************************************/

// Global değişkenler: Son blok bilgileri (resetlenmesi gerektiğinde sıfırlanacak)
let lastMessageSender = null;
let lastMessageTimestamp = null;

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
  // Yeni blok başlıyor; global blok bilgilerini sıfırla
  lastMessageSender = null;
  lastMessageTimestamp = null;
}

// Mesajı, tam header (avatar + kullanıcı adı + zaman) şeklinde render eder.
// Bu header, ilk mesaj (veya yeni blok) için kullanılır.
function renderFullMessage(msg, sender, time, msgClass) {
  return `
    <div class="message-item">
      <div class="message-header">
        <div class="message-avatar-container">
          <img class="message-avatar" src="/images/default-avatar.png" alt="">
        </div>
        <div class="message-info">
          <div class="sender-name">${sender}</div>
          <div class="timestamp">${time}</div>
        </div>
      </div>
      <div class="message-content ${msgClass}">${msg.content}</div>
    </div>
  `;
}

// Sadece mesaj içeriğini render eder (header olmadan).
// Bu durumda, mesajın solunda hover ile gösterilecek saat bilgisi için .hover-time elementi eklenir.
function renderContentOnly(msg, msgClass, time) {
  return `
    <div class="message-item" style="position: relative;">
      <span class="hover-time">${time}</span>
      <div class="message-content ${msgClass}" style="margin-left: 48px;">${msg.content}</div>
    </div>
  `;
}

// Verilen mesaj listesini container içerisine render eder.
function renderTextMessages(messages, container) {
  container.innerHTML = "";
  // Yeni seans: global blok bilgilerini sıfırla
  lastMessageSender = null;
  lastMessageTimestamp = null;
  
  messages.forEach((msg, index) => {
    const sender = (msg.user && msg.user.username) ? msg.user.username : "Anon";
    const time = formatTimestamp(msg.timestamp);
    let msgClass = "";
    
    // Belirle: Eğer yeni blok (yani global değişken sıfırlıysa) veya önceki mesajdan farklı gönderici ya da gün farkı varsa
    if (!lastMessageSender || lastMessageSender !== sender || !lastMessageTimestamp || isDifferentDay(lastMessageTimestamp, msg.timestamp)) {
      msgClass = "only-message";
    } else {
      // Aynı blok içindeyse
      msgClass = "last-message";
    }
    
    let msgHTML = "";
    if (msgClass === "only-message") {
      msgHTML = renderFullMessage(msg, sender, time, msgClass);
    } else {
      msgHTML = renderContentOnly(msg, msgClass, time);
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-message left-message';
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
    
    // Güncelle global blok bilgilerini
    lastMessageSender = sender;
    lastMessageTimestamp = new Date(msg.timestamp);
  });
  container.scrollTop = container.scrollHeight;
}

// Yeni gelen mesajı, container'daki son blok bilgilerine göre render eder.
// Global değişkenlere göre yeni mesaj ardışık mı (aynı blok) yoksa yeni blok mu olduğunu belirler.
function appendNewMessage(msg, container) {
  const sender = msg.username || "Anon";
  const time = formatTimestamp(msg.timestamp);
  
  // Eğer global blok bilgileri sıfırlıysa veya gün farkı varsa yeni blok başlat
  if (!lastMessageSender || !lastMessageTimestamp || isDifferentDay(lastMessageTimestamp, msg.timestamp)) {
    insertDateSeparator(container, msg.timestamp);
    // Yeni blok: tam header (only-message)
    const msgHTML = renderFullMessage(msg, sender, time, "only-message");
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-message left-message';
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
    lastMessageSender = sender;
    lastMessageTimestamp = new Date(msg.timestamp);
  } else if (lastMessageSender !== sender) {
    // Farklı gönderici: yeni blok başlat
    const msgHTML = renderFullMessage(msg, sender, time, "only-message");
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-message left-message';
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
    lastMessageSender = sender;
    lastMessageTimestamp = new Date(msg.timestamp);
  } else {
    // Aynı gönderici ve aynı gün: ardışık mesaj, önceki mesajın sınıfını güncelle
    // (Varsayalım ki, container içinde global olarak en son eklenen mesaj ardışık blokun son mesajı olarak görünsün)
    // Arayüzde, önceki mesajın header'ı kaldırılarak avatar/kullanıcı adı sadece ilk mesajda gösterilecek.
    // Ancak hover-time sayesinde zaman bilgisi sunulacak.
    // İlk olarak, container'ın en son mesajını bulalım.
    let lastMsgElem = container.lastElementChild;
    while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
      lastMsgElem = lastMsgElem.previousElementSibling;
    }
    if (lastMsgElem) {
      const lastContent = lastMsgElem.querySelector('.message-content');
      if (lastContent && lastContent.classList.contains("only-message")) {
        lastContent.classList.remove("only-message");
        lastContent.classList.add("first-message");
      } else if (lastContent && lastContent.classList.contains("last-message")) {
        lastContent.classList.remove("last-message");
        lastContent.classList.add("middle-message");
      }
    }
    // Yeni mesaj: ardışık mesaj (last-message)
    const msgHTML = renderContentOnly(msg, "last-message", time);
    const msgDiv = document.createElement('div');
    msgDiv.className = 'text-message left-message';
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
    lastMessageSender = sender;
    lastMessageTimestamp = new Date(msg.timestamp);
  }
  container.scrollTop = container.scrollHeight;
}

// Socket üzerinden gelen "textHistory" ve "newTextMessage" eventlerini işleyip,
// ilgili container'a mesajları render eder.
function initTextChannelEvents(socket, container) {
  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
    // Yeni seans başladığından global blok bilgilerini resetleyelim
    lastMessageSender = null;
    lastMessageTimestamp = null;
  });

  socket.on('newTextMessage', (data) => {
    if (data.channelId === container.dataset.channelId) {
      const msg = data.message;
      // Eğer container'ın son mesajıyla (date-separator hariç) gün farkı varsa tarih ayıracı ekle.
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
