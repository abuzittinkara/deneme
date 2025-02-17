/**************************************
 * public/js/textChannel.js
 **************************************/
function isDifferentDay(ts1, ts2) {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() !== d2.getFullYear() ||
         d1.getMonth() !== d2.getMonth() ||
         d1.getDate() !== d2.getDate();
}

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

function insertDateSeparator(container, timestamp) {
  const separator = document.createElement('div');
  separator.className = 'date-separator';
  separator.innerHTML = `<span class="separator-text">${formatTimestamp(timestamp)}</span>`;
  container.appendChild(separator);
}

function renderTextMessages(messages, container) {
  container.innerHTML = "";
  messages.forEach((msg, index) => {
    if (index === 0 || isDifferentDay(messages[index - 1].timestamp, msg.timestamp)) {
      insertDateSeparator(container, msg.timestamp);
    }
    const time = formatTimestamp(msg.timestamp);
    const sender = (msg.user && msg.user.username) ? msg.user.username : "Anon";
    // Tüm mesajlar için aynı (sola hizalı) sınıf kullanıyoruz:
    let className = 'text-message left-message ';
    const msgDiv = document.createElement('div');
    msgDiv.className = className;
    msgDiv.setAttribute('data-timestamp', msg.timestamp);
    msgDiv.setAttribute('data-sender', sender);
    // Her mesaj için ortak yapı kullanılıyor:
    msgDiv.innerHTML = `<div class="message-content with-timestamp"><span class="own-timestamp">${time}</span> ${msg.content}</div>`;
    container.appendChild(msgDiv);
  });
  container.scrollTop = container.scrollHeight;
}

function initTextChannelEvents(socket, container) {
  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
  });

  socket.on('newTextMessage', (data) => {
    if (data.channelId === container.dataset.channelId) {
      const msg = data.message;
      let lastMsgDiv = container.lastElementChild;
      while (lastMsgDiv && lastMsgDiv.classList.contains('date-separator')) {
        lastMsgDiv = lastMsgDiv.previousElementSibling;
      }
      if (!lastMsgDiv || (lastMsgDiv && isDifferentDay(lastMsgDiv.getAttribute('data-timestamp'), msg.timestamp))) {
        insertDateSeparator(container, msg.timestamp);
      }
      const time = formatTimestamp(msg.timestamp);
      const sender = msg.username || "Anon";
      // Her mesaj için aynı (sola hizalı) sınıf kullanıyoruz:
      let className = 'text-message left-message ';
      const msgDiv = document.createElement('div');
      msgDiv.className = className;
      msgDiv.setAttribute('data-timestamp', msg.timestamp);
      msgDiv.setAttribute('data-sender', sender);
      msgDiv.innerHTML = `<div class="message-content with-timestamp"><span class="own-timestamp">${time}</span> ${msg.content}</div>`;
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
    }
  });
}

export { initTextChannelEvents, renderTextMessages, formatTimestamp, insertDateSeparator, isDifferentDay };
