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

function formatTimeOnly(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLongDate(timestamp) {
  const date = new Date(timestamp);
  const day = date.getDate();
  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function insertDateSeparator(container, timestamp) {
  const separator = document.createElement('div');
  separator.className = 'date-separator';
  separator.innerHTML = `<span class="separator-text">${formatLongDate(timestamp)}</span>`;
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
    let className = 'text-message ';
    className += (sender === window.username) ? 'sent-message ' : 'received-message ';
    className += (index === 0 || (messages[index - 1].user && messages[index - 1].user.username !== sender) || isDifferentDay(messages[index - 1].timestamp, msg.timestamp)) ? 'first-message ' : 'subsequent-message ';
    className += 'last-message';
    const msgDiv = document.createElement('div');
    msgDiv.className = className;
    if (sender === window.username) {
      msgDiv.innerHTML = `<div class="message-content with-timestamp"><span class="own-timestamp">${time}</span> ${msg.content}</div>`;
    } else {
      msgDiv.innerHTML = `<div class="message-content with-avatar"><span class="sender-name">${sender}</span> <span class="timestamp">${time}</span><br>${msg.content}</div>`;
    }
    msgDiv.setAttribute('data-timestamp', msg.timestamp);
    msgDiv.setAttribute('data-sender', sender);
    container.appendChild(msgDiv);
  });
  container.scrollTop = container.scrollHeight;
}

function initTextChannelEvents(socket, container) {
  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
  });
  
  socket.on('newTextMessage', (data) => {
    if (data.channelId === window.currentTextChannel) {
      const msg = data.message;
      const time = formatTimestamp(msg.timestamp);
      let lastMsgDiv = container.lastElementChild;
      while (lastMsgDiv && lastMsgDiv.classList.contains('date-separator')) {
        lastMsgDiv = lastMsgDiv.previousElementSibling;
      }
      if (!lastMsgDiv) {
        insertDateSeparator(container, msg.timestamp);
      } else {
        const lastMsgTime = lastMsgDiv.getAttribute('data-timestamp');
        if (lastMsgTime && isDifferentDay(lastMsgTime, msg.timestamp)) {
          insertDateSeparator(container, msg.timestamp);
        }
      }
      const isFirst = (
        !lastMsgDiv ||
        (lastMsgDiv.getAttribute('data-sender') !== msg.username) ||
        (lastMsgDiv.getAttribute('data-timestamp') && isDifferentDay(lastMsgDiv.getAttribute('data-timestamp'), msg.timestamp))
      );
      if (lastMsgDiv && lastMsgDiv.getAttribute('data-sender') === msg.username) {
        lastMsgDiv.classList.remove('last-message');
      }
      let className = 'text-message ';
      className += (msg.username === window.username) ? 'sent-message ' : 'received-message ';
      className += isFirst ? 'first-message ' : 'subsequent-message ';
      className += 'last-message';
      const msgDiv = document.createElement('div');
      msgDiv.className = className;
      if (msg.username === window.username) {
        if (isFirst) {
          msgDiv.innerHTML = `<div class="message-content with-timestamp"><span class="own-timestamp">${time}</span> ${msg.content}</div>`;
        } else {
          msgDiv.innerHTML = `<div class="message-content without-timestamp">${msg.content}<span class="timestamp-hover">${formatTimeOnly(msg.timestamp)}</span></div>`;
        }
      } else {
        if (isFirst) {
          const avatarHTML = `<div class="message-avatar profile-thumb">${msg.username.charAt(0).toUpperCase()}</div>`;
          msgDiv.innerHTML = `${avatarHTML}<div class="message-content with-avatar"><span class="sender-name">${msg.username}</span> <span class="timestamp">${time}</span><br>${msg.content}</div>`;
        } else {
          const avatarPlaceholder = `<div class="message-avatar placeholder"></div>`;
          msgDiv.innerHTML = `${avatarPlaceholder}<div class="message-content without-avatar">${msg.content}<span class="timestamp-hover">${formatTimeOnly(msg.timestamp)}</span></div>`;
        }
      }
      msgDiv.setAttribute('data-timestamp', msg.timestamp);
      msgDiv.setAttribute('data-sender', msg.username);
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
    }
  });
}

export { initTextChannelEvents, renderTextMessages, formatTimestamp, formatTimeOnly, formatLongDate, isDifferentDay, insertDateSeparator };
