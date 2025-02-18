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

// Belirtilen container'a, verilen timestamp için tarih ayırıcı ekler.
function insertDateSeparator(container, timestamp) {
  const separator = document.createElement('div');
  separator.className = 'date-separator';
  separator.innerHTML = `<span class="separator-text">${formatTimestamp(timestamp)}</span>`;
  container.appendChild(separator);
}

// Mesajı, tam header (avatar + kullanıcı adı + zaman) şeklinde render eder.
// Avatar olarak, UserPanel’de kullanılan gerçek avatar (<img>) kullanılır.
function renderFullMessage(msg, sender, time) {
  return `
    <div class="message-item">
      <div class="message-header">
        <div class="avatar-and-name">
          <img class="message-avatar" src="/images/default-avatar.png" alt="">
          <span class="sender-name">${sender}</span>
        </div>
        <span class="timestamp">${time}</span>
      </div>
      <div class="message-content">${msg.content}</div>
    </div>
  `;
}

// Sadece mesaj içeriğini render eder (header olmadan).
function renderContentOnly(msg) {
  return `
    <div class="message-item">
      <div class="message-content" style="margin-left: 48px;">${msg.content}</div>
    </div>
  `;
}

// Mesajın blok içindeki konumuna göre (ilk, orta, son, yalnız) sınıfı döndürür.
function getMessagePositionClass(messages, index, sender) {
  const prevSame = index > 0 && ((messages[index - 1].user && messages[index - 1].user.username) === sender);
  const nextSame = index < messages.length - 1 && ((messages[index + 1].user && messages[index + 1].user.username) === sender);
  if (!prevSame && !nextSame) {
    return "only-message";
  } else if (!prevSame && nextSame) {
    return "first-message";
  } else if (prevSame && nextSame) {
    return "middle-message";
  } else if (prevSame && !nextSame) {
    return "last-message";
  }
  return "";
}

// Verilen mesaj listesini container içerisine render eder.
function renderTextMessages(messages, container) {
  container.innerHTML = "";
  messages.forEach((msg, index) => {
    const sender = (msg.user && msg.user.username) ? msg.user.username : "Anon";
    const time = formatTimestamp(msg.timestamp);
    const posClass = getMessagePositionClass(messages, index, sender);
    let msgHTML = "";
    if (posClass === "only-message" || posClass === "first-message" || posClass === "last-message") {
      msgHTML = renderFullMessage(msg, sender, time);
    } else {
      msgHTML = renderContentOnly(msg);
    }
    const msgDiv = document.createElement('div');
    msgDiv.className = `text-message left-message ${posClass}`;
    msgDiv.setAttribute('data-timestamp', msg.timestamp);
    msgDiv.setAttribute('data-sender', sender);
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
  });
  container.scrollTop = container.scrollHeight;
}

// Yeni gelen mesajı, container'daki son mesajla karşılaştırarak render eder.
// (Burada, basitçe, önceki mesajın göndericisi ile kontrol yapıyoruz; 
// tam yeniden sınıflandırma için container yeniden render edilebilir.)
function appendNewMessage(msg, container) {
  const sender = msg.username || "Anon";
  const time = formatTimestamp(msg.timestamp);
  let lastChild = container.lastElementChild;
  let prevSender = "";
  if (lastChild && !lastChild.classList.contains('date-separator')) {
    prevSender = lastChild.getAttribute('data-sender');
  }
  let posClass = "";
  if (!prevSender || prevSender !== sender) {
    posClass = "only-message";
  } else {
    // Eğer önceki mesaj aynı göndericiden ise,
    // mevcut son mesajı güncelle (eğer "only-message" ise "first-message", 
    // eğer "last-message" ise "middle-message")
    if (lastChild.classList.contains("only-message")) {
      lastChild.classList.remove("only-message");
      lastChild.classList.add("first-message");
    } else if (lastChild.classList.contains("last-message")) {
      lastChild.classList.remove("last-message");
      lastChild.classList.add("middle-message");
    }
    posClass = "last-message";
  }
  let msgHTML = "";
  if (posClass === "only-message" || posClass === "first-message" || posClass === "last-message") {
    msgHTML = renderFullMessage(msg, sender, time);
  } else {
    msgHTML = renderContentOnly(msg);
  }
  const msgDiv = document.createElement('div');
  msgDiv.className = `text-message left-message ${posClass}`;
  msgDiv.setAttribute('data-timestamp', msg.timestamp);
  msgDiv.setAttribute('data-sender', sender);
  msgDiv.innerHTML = msgHTML;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function initTextChannelEvents(socket, container) {
  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
  });

  socket.on('newTextMessage', (data) => {
    if (data.channelId === container.dataset.channelId) {
      const msg = data.message;
      let lastChild = container.lastElementChild;
      if (!lastChild || lastChild.classList.contains('date-separator')) {
        insertDateSeparator(container, msg.timestamp);
      }
      appendNewMessage(msg, container);
    }
  });
}

export { isDifferentDay, formatTimestamp, insertDateSeparator, renderTextMessages, initTextChannelEvents, appendNewMessage };
