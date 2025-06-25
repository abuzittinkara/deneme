/**************************************
 * public/js/textChannel.js
 * Metin (mesaj) kanallarıyla ilgili tüm fonksiyonlar burada toplanmıştır.
**************************************/
import { showProfilePopout } from './profilePopout.js';

// Global olarak her kanal için son mesaj bilgisini saklayan obje (append işlemleri için kullanılır)
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

// Belirtilen container'a, verilen timestamp için tarih ayıracı ekler.
// Ayıracı, tüm genişliği kaplayan yatay çizgi şeklinde olup ortasında uzun formatta tarih metni bulunur.
// DEĞİŞİKLİK: Oluşturulan separator öğesine data-timestamp özniteliği ekleniyor.
function insertDateSeparator(container, timestamp) {
  const separator = document.createElement('div');
  separator.className = 'date-separator';
  separator.setAttribute('data-timestamp', new Date(timestamp).toISOString());
  separator.innerHTML = `<span class="separator-text">${formatLongDate(timestamp)}</span>`;
  container.appendChild(separator);
}

// Mesajı, tam header (avatar, kullanıcı adı ve zaman) şeklinde render eder.
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const mb = 1024 * 1024;
  const kb = 1024;
  if (bytes >= mb) return `${(bytes / mb).toFixed(1)} MB`;
  if (bytes >= kb) return `${(bytes / kb).toFixed(1)} KB`;
  return `${bytes} B`;
}

function renderAttachments(atts = []) {
  if (!atts.length) return '';
  return `
    <div class="message-attachments">
      ${atts
        .map(a => {
          const type = a.type || '';
          const url = a.url || '';
          const name = a.name || url.split('/').pop();
          const size = a.size ? formatFileSize(a.size) : '';
          if (type.startsWith('image/')) {
            return `<img src="${url}" data-lightbox="${url}" alt="${name}">`;
          } else if (type.startsWith('video/')) {
            return `<video controls data-lightbox="${url}"><source src="${url}" type="${type}"></video>`;
          } else if (type.startsWith('audio/')) {
            return `<audio controls src="${url}"></audio>`;
          }
          const icon = /pdf$/i.test(type) || name.toLowerCase().endsWith('.pdf')
            ? 'picture_as_pdf'
            : /(zip|rar|7z)/i.test(type) || name.toLowerCase().match(/\.(zip|rar|7z)$/)
            ? 'archive'
            : 'insert_drive_file';
          const cls = icon === 'picture_as_pdf' ? 'pdf' : icon === 'archive' ? 'archive' : 'default';
          return `
            <a class="attachment-wrapper" data-url="${url}" data-name="${name}" tabindex="0">
              <span class="file-icon ${cls} material-icons">${icon}</span>
              <div class="file-text">
                <div class="file-name">${name}</div>
                <div class="file-info">${size}</div>
              </div>
            </a>
          `;
        })
        .join('')}
    </div>`;
}

function highlightMentions(text) {
  if (!text) return '';
  return text.replace(/@([A-Za-z0-9_]+)/g, '<span class="mention">@$1</span>');
}

function throttle(fn, interval) {
  let last = 0;
  let timeout;
  return (...args) => {
    const now = Date.now();
    const remaining = interval - (now - last);
    const run = () => {
      last = Date.now();
      requestAnimationFrame(() => fn(...args));
    };
    if (remaining <= 0) {
      run();
    } else {
      clearTimeout(timeout);
      timeout = setTimeout(run, remaining);
    }
  };
}

let lightboxEl = null;

function openLightbox(target) {
  if (!lightboxEl) {
    lightboxEl = document.createElement('div');
    lightboxEl.id = 'mediaLightbox';
    lightboxEl.className = 'modal';
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.background = 'transparent';
    content.style.boxShadow = 'none';
    content.style.padding = '0';
    lightboxEl.appendChild(content);
    lightboxEl.style.display = 'none';
    lightboxEl.addEventListener('click', e => {
      if (e.target === lightboxEl) closeLightbox();
    });
    document.body.appendChild(lightboxEl);
  }
  const container = lightboxEl.querySelector('.modal-content');
  container.innerHTML = '';
  let node;
  if (target.tagName === 'IMG') {
    node = document.createElement('img');
    node.src = target.dataset.lightbox || target.src;
  } else {
    node = document.createElement('video');
    node.src = target.dataset.lightbox || target.querySelector('source')?.src || target.src;
    node.controls = true;
  }
  container.appendChild(node);
  lightboxEl.style.display = 'flex';
  lightboxEl.classList.add('active');
  document.addEventListener('keydown', escClose);
}

function escClose(e) { if (e.key === 'Escape') closeLightbox(); }

function closeLightbox() {
  if (!lightboxEl) return;
  lightboxEl.style.display = 'none';
  lightboxEl.classList.remove('active');
  document.removeEventListener('keydown', escClose);
}

function showAttachmentMenu(wrapper, e) {
  e.preventDefault();
  const existing = document.getElementById('attachmentContextMenu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'attachmentContextMenu';
  menu.className = 'context-menu';
  menu.style.position = 'absolute';
  menu.style.top = e.pageY + 'px';
  menu.style.left = e.pageX + 'px';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';

  function closeMenu() {
    menu.remove();
    document.removeEventListener('click', onDoc);
    document.removeEventListener('keydown', onEsc);
  }

  function onDoc(ev) {
    if (!menu.contains(ev.target)) closeMenu();
  }

  function onEsc(ev) { if (ev.key === 'Escape') closeMenu(); }

  const url = wrapper.dataset.url;
  const name = wrapper.dataset.name || '';

  const items = [
    {
      text: 'Download',
      action: () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    },
    {
      text: 'Preview',
      action: () => {
        window.open(url, '_blank');
      }
    },
    {
      text: 'Copy link to message',
      action: () => {
        const msg = wrapper.closest('.text-message');
        const ts = msg ? msg.dataset.timestamp : '';
        const link = `${location.origin}${location.pathname}#${ts}`;
        navigator.clipboard.writeText(link).catch(() => {});
      }
    }
  ];

  items.forEach(it => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = it.text;
    item.addEventListener('click', () => {
      it.action();
      closeMenu();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onEsc);
  });
}

function renderFullMessage(msg, sender, time, msgClass) {
  const content = highlightMentions(msg.content);
  return `
    <div class="message-item" style="position: relative;">
      <span class="delete-icon material-symbols-outlined">delete</span>
      <div class="message-header">
        <div class="message-avatar-container">
          <img class="message-avatar" data-username="${sender}" src="/images/default-avatar.png" alt="">
        </div>
        <div class="sender-info">
          <span class="sender-name">${sender}</span>
          <span class="timestamp">${time}</span>
        </div>
      </div>
      <div class="message-content ${msgClass}">${content}${renderAttachments(msg.attachments)}</div>
    </div>
  `;
}

// Sadece mesaj içeriğini render eder (header olmadan).
// Bu durumda mesajın solunda hover ile gösterilecek saat bilgisi için .hover-time elementi eklenir.
// Güncelleme: hover-time kısmında yalnızca saat bilgisi gösterilsin.
function renderContentOnly(msg, msgClass, timestamp) {
  const content = highlightMentions(msg.content);
  return `
    <div class="message-item" style="position: relative;">
      <span class="hover-time">${formatTime(timestamp)}</span>
      <span class="delete-icon material-symbols-outlined">delete</span>
      <div class="message-content ${msgClass}">${content}${renderAttachments(msg.attachments)}</div>
    </div>
  `;
}

// Verilen mesaj listesini container içerisine render eder.
// Mesajlar arasında gün farkı varsa her defasında ilgili tarih ayıracını ekler.
function renderTextMessages(messages, container) {
  container.innerHTML = "";
  let previousDate = null;
  messages.forEach((msg, index) => {
    const sender = (msg.user && msg.user.username) ? msg.user.username : "Anon";
    const msgDate = new Date(msg.timestamp);
    const fullTime = formatTimestamp(msg.timestamp);
    let msgClass = "";
    
    // Eğer önceki mesaj yoksa veya gün farkı varsa, tarih ayıracını ekle.
    if (!previousDate || isDifferentDay(previousDate, msgDate)) {
      insertDateSeparator(container, msg.timestamp);
    }
    previousDate = msgDate;
    
    // Blok sınıflandırması:
    if (index === 0 ||
        ((messages[index - 1].user && messages[index - 1].user.username) !== sender) ||
        isDifferentDay(messages[index - 1].timestamp, msg.timestamp)) {
      if (index === messages.length - 1 ||
          ((messages[index + 1].user && messages[index + 1].user.username) !== sender) ||
          isDifferentDay(msg.timestamp, messages[index + 1].timestamp)) {
        msgClass = "only-message";
      } else {
        msgClass = "first-message";
      }
    } else if (index === messages.length - 1 ||
               ((messages[index + 1].user && messages[index + 1].user.username) !== sender) ||
               isDifferentDay(msg.timestamp, messages[index + 1].timestamp)) {
      msgClass = "last-message";
    } else {
      msgClass = "middle-message";
    }
    
    let msgHTML = "";
    if (msgClass === "only-message" || msgClass === "first-message") {
      msgHTML = renderFullMessage(msg, sender, fullTime, msgClass);
    } else {
      msgHTML = renderContentOnly(msg, msgClass, msg.timestamp);
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `text-message ${msgClass}`;
    msgDiv.setAttribute('data-id', msg.id || msg._id || '');
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
    if (sender === window.username) msgDiv.classList.add('own-message');
    window.loadAvatar(sender).then(av => {
      const img = msgDiv.querySelector('.message-avatar');
      if (img) img.src = av;
    });
    msgDiv.innerHTML = msgHTML;
    container.appendChild(msgDiv);
    
    // Global lastMessageInfo güncellemesi (append işlemleri için)
    lastMessageInfo[container.dataset.channelId] = { sender, timestamp: new Date(msg.timestamp), count: 1 };
  });
  container.scrollTop = container.scrollHeight;
}

// --- AŞAĞI: DEĞİŞİKLİK YAPILMIŞ appendNewMessage FONKSİYONU ---
// Her yeni mesaj gönderildiğinde, eğer son gönderilen mesaj aynı gün ve aynı göndericiden ise,
// o mesajın dış kapsayıcısı (.text-message) ve içeriği (.message-content) "middle-message" olarak güncellenecek,
// ve yeni mesaj "last-message" olarak eklenecek.
// Eğer ardışık mesaj yoksa yeni mesaj "only-message" olarak eklenir.
function appendNewMessage(msg, container) {
  const sender = msg.username || "Anon";
  const fullTime = formatTimestamp(msg.timestamp);
  let newMsgClass = "last-message"; // varsayılan

  const nearBottom =
    container.scrollTop + container.clientHeight >=
    container.scrollHeight - 20;
  
  // Son eklenen metin mesajı (date separator hariç) alınıyor.
  const messages = container.querySelectorAll('.text-message');
  let lastMsgElem = messages.length > 0 ? messages[messages.length - 1] : null;
  
  if (lastMsgElem && lastMsgElem.getAttribute('data-sender') === sender) {
    let lastTimestamp = new Date(lastMsgElem.getAttribute('data-timestamp'));
    if (!isDifferentDay(lastTimestamp, msg.timestamp)) {
      // Hem dış kapsayıcıyı hem de iç message-content öğesini "middle-message" olarak güncelle
      lastMsgElem.classList.remove("only-message", "first-message", "middle-message", "last-message");
      lastMsgElem.classList.add("middle-message");
      const lastContent = lastMsgElem.querySelector('.message-content');
      if (lastContent) {
        lastContent.classList.remove("only-message", "first-message", "middle-message", "last-message");
        lastContent.classList.add("middle-message");
      }
      newMsgClass = "last-message";
    } else {
      newMsgClass = "only-message";
    }
  } else {
    newMsgClass = "only-message";
  }
  
  // Yeni mesajı oluştur:
  let msgHTML = "";
  if (newMsgClass === "only-message") {
    msgHTML = renderFullMessage(msg, sender, fullTime, newMsgClass);
  } else {
    msgHTML = renderContentOnly(msg, newMsgClass, msg.timestamp);
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.setAttribute('data-id', msg.id || msg._id || '');
  msgDiv.className = `text-message ${newMsgClass}`;
  msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
  msgDiv.setAttribute('data-sender', sender);
  if (sender === window.username) msgDiv.classList.add('own-message');
  window.loadAvatar(sender).then(av => {
    const img = msgDiv.querySelector('.message-avatar');
    if (img) img.src = av;
  });
  msgDiv.innerHTML = msgHTML;
  container.appendChild(msgDiv);
  if (nearBottom) {
    msgDiv.scrollIntoView({ behavior: 'smooth' });
  }
  
  // Son mesaj bilgilerini güncelle (DOM üzerinden güncelleme yapılıyor)
  lastMessageInfo[container.dataset.channelId] = { sender, timestamp: new Date(msg.timestamp) };
}

function updateMessageClasses(container) {
  const msgs = Array.from(container.querySelectorAll('.text-message'));
  msgs.forEach((msg, i) => {
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const sender = msg.dataset.sender;
    const prevSender = prev ? prev.dataset.sender : null;
    const nextSender = next ? next.dataset.sender : null;
    const prevTs = prev ? prev.dataset.timestamp : null;
    const nextTs = next ? next.dataset.timestamp : null;
    const ts = msg.dataset.timestamp;
    const prevSame = prev && prevSender === sender && !isDifferentDay(prevTs, ts);
    const nextSame = next && nextSender === sender && !isDifferentDay(ts, nextTs);
    let cls = 'only-message';
    if (!prevSame && nextSame) cls = 'first-message';
    else if (prevSame && !nextSame) cls = 'last-message';
    else if (prevSame && nextSame) cls = 'middle-message';

    const oldCls = msg.classList.contains('first-message') ? 'first-message'
                  : msg.classList.contains('last-message') ? 'last-message'
                  : msg.classList.contains('middle-message') ? 'middle-message'
                  : 'only-message';

    msg.classList.remove('first-message','middle-message','last-message','only-message');
    msg.classList.add(cls);

    const item = msg.querySelector('.message-item');
    if (item && cls !== oldCls) {
      if ((cls === 'first-message' || cls === 'only-message') &&
          !(oldCls === 'first-message' || oldCls === 'only-message')) {
        const hover = item.querySelector('.hover-time');
        if (hover) hover.remove();
        if (!item.querySelector('.message-header')) {
          const sender = msg.dataset.sender;
          const header = document.createElement('div');
          header.className = 'message-header';
          header.innerHTML = `
            <div class="message-avatar-container">
              <img class="message-avatar" data-username="${sender}" src="/images/default-avatar.png" alt="">
            </div>
            <div class="sender-info">
              <span class="sender-name">${sender}</span>
              <span class="timestamp">${formatTimestamp(ts)}</span>
            </div>`;
          const delIcon = item.querySelector('.delete-icon');
          if (delIcon) item.insertBefore(header, delIcon.nextSibling);
          else item.insertBefore(header, item.firstChild);
          window.loadAvatar(sender).then(av => {
            const img = header.querySelector('.message-avatar');
            if (img) img.src = av;
          });
        }
      } else if ((cls === 'middle-message' || cls === 'last-message') &&
                 (oldCls === 'first-message' || oldCls === 'only-message')) {
        const header = item.querySelector('.message-header');
        if (header) header.remove();
        if (!item.querySelector('.hover-time')) {
          const hover = document.createElement('span');
          hover.className = 'hover-time';
          hover.textContent = formatTime(ts);
          item.insertBefore(hover, item.firstChild);
        }
      }
    }
    
    const content = msg.querySelector('.message-content');
    if (content) {
      content.classList.remove('first-message','middle-message','last-message','only-message');
      content.classList.add(cls);
    }
  });
}

function removeMessageElement(container, id) {
  const el = container.querySelector(`.text-message[data-id="${id}"]`);
  if (!el) return;
  const prev = el.previousElementSibling;
  const next = el.nextElementSibling;
  el.remove();
  if (prev && prev.classList.contains('date-separator') && (!next || next.classList.contains('date-separator'))) {
    prev.remove();
  }
  updateMessageClasses(container);
}

// Yeni gelen mesajı, mevcut mesaj listesine eklerken tarih ayıracı kontrolünü yapar.
function initTextChannelEvents(socket, container) {
  function markReadIfAtBottom() {
    const atBottom =
      container.scrollTop + container.clientHeight >= container.scrollHeight - 5;
    const groupId = window.selectedGroup;
    const channelId = container.dataset.channelId;
    if (
      atBottom &&
      groupId &&
      channelId &&
      window.channelUnreadCounts[groupId] &&
      window.channelUnreadCounts[groupId][channelId] > 0
    ) {
      socket.emit('markChannelRead', { groupId, channelId });
    }
  }

  const throttledMarkReadIfAtBottom = throttle(markReadIfAtBottom, 100);
  container.addEventListener('scroll', throttledMarkReadIfAtBottom);

  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
    throttledMarkReadIfAtBottom();
  });

  socket.on('newTextMessage', (data) => {
    if (data.channelId === container.dataset.channelId) {
      const msg = data.message;
      // Tarih ayıracı kontrolü:
      let lastElement = container.lastElementChild;
      let lastTimestamp = null;
      if (lastElement && lastElement.classList.contains('date-separator')) {
        lastTimestamp = lastElement.getAttribute('data-timestamp');
      } else {
        let lastMsgElem = container.lastElementChild;
        while (lastMsgElem && lastMsgElem.classList.contains('date-separator')) {
          lastMsgElem = lastMsgElem.previousElementSibling;
        }
        if (lastMsgElem) {
          lastTimestamp = lastMsgElem.getAttribute('data-timestamp');
        }
      }
      if (!lastTimestamp || isDifferentDay(lastTimestamp, msg.timestamp)) {
        insertDateSeparator(container, msg.timestamp);
      }
      appendNewMessage(msg, container);
      throttledMarkReadIfAtBottom();
      const attachmentUrls = Array.isArray(msg.attachments)
        ? msg.attachments.map(a => a.url).filter(u => u && u.startsWith('/uploads/'))
        : [];
      if (attachmentUrls.length && window.cacheUploadUrls) {
        window.cacheUploadUrls(attachmentUrls);
      }
    }
  });
  socket.on('textMessageDeleted', ({ channelId, messageId }) => {
    if (channelId === container.dataset.channelId) {
      removeMessageElement(container, messageId);
      updateMessageClasses(container);
    }
  });
  socket.on('avatarUpdated', ({ username, avatar }) => {
    window.userAvatars[username] = avatar;
    container.querySelectorAll(`[data-username="${username}"]`).forEach(img => {
      img.src = avatar || '/images/default-avatar.png';
    });
  });
  container.addEventListener('click', (e) => {
    const avatar = e.target.closest('.message-avatar');
    const nameEl = e.target.closest('.sender-name');
    const media = e.target.closest('.message-attachments img, .message-attachments video');
    const file = e.target.closest('.attachment-wrapper');
    const del = e.target.closest('.delete-icon');
    if (avatar) {
      const uname = avatar.dataset.username;
      if (uname) showProfilePopout(uname, e);
    } else if (nameEl) {
      showProfilePopout(nameEl.textContent.trim(), e);
    } else if (media) {
      openLightbox(media);
    } else if (file) {
      e.preventDefault();
      const url = file.dataset.url;
      const name = file.dataset.name || '';
      if (e.shiftKey) {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } else if (del) {
      const msgEl = del.closest('.text-message');
      if (msgEl) {
        const ok = e.shiftKey || window.confirm('Bu mesajı silmek istediğinize emin misiniz?');
        if (ok) {
          socket.emit('deleteTextMessage', {
            channelId: container.dataset.channelId,
            messageId: msgEl.dataset.id
          });
          removeMessageElement(container, msgEl.dataset.id);
          updateMessageClasses(container);
        }
      }
    }
  });
}

export { isDifferentDay, formatTimestamp, formatLongDate, insertDateSeparator, renderTextMessages, initTextChannelEvents, appendNewMessage, removeMessageElement, updateMessageClasses };