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
          const size = a.size ? ` (${formatFileSize(a.size)})` : '';
          if (type.startsWith('image/')) {
            return `<img src="${url}" data-lightbox="${url}" alt="${name}">`;
          } else if (type.startsWith('video/')) {
            return `<video controls data-lightbox="${url}"><source src="${url}" type="${type}"></video>`;
          } else if (type.startsWith('audio/')) {
            return `<audio controls src="${url}"></audio>`;
          }
          return `<div class="file-pill" data-url="${url}" data-name="${name}" tabindex="0">${name}${size}</div>`;
        })
        .join('')}
    </div>`;
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

function renderFullMessage(msg, sender, time, msgClass) {
  return `
    <div class="message-item">
      <div class="message-header">
        <div class="message-avatar-container">
          <img class="message-avatar" data-username="${sender}" src="/images/default-avatar.png" alt="">
        </div>
        <div class="sender-info">
          <span class="sender-name">${sender}</span>
          <span class="timestamp">${time}</span>
        </div>
      </div>
      <div class="message-content ${msgClass}">${msg.content}${renderAttachments(msg.attachments)}</div>
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
      <div class="message-content ${msgClass}">${msg.content}${renderAttachments(msg.attachments)}</div>
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
    msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
    msgDiv.setAttribute('data-sender', sender);
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
  msgDiv.className = `text-message ${newMsgClass}`;
  msgDiv.setAttribute('data-timestamp', new Date(msg.timestamp).toISOString());
  msgDiv.setAttribute('data-sender', sender);
  window.loadAvatar(sender).then(av => {
    const img = msgDiv.querySelector('.message-avatar');
    if (img) img.src = av;
  });
  msgDiv.innerHTML = msgHTML;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  
  // Son mesaj bilgilerini güncelle (DOM üzerinden güncelleme yapılıyor)
  lastMessageInfo[container.dataset.channelId] = { sender, timestamp: new Date(msg.timestamp) };
}

// Yeni gelen mesajı, mevcut mesaj listesine eklerken tarih ayıracı kontrolünü yapar.
function initTextChannelEvents(socket, container) {
  socket.on('textHistory', (messages) => {
    renderTextMessages(messages, container);
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
      const attachmentUrls = Array.isArray(msg.attachments)
        ? msg.attachments.map(a => a.url).filter(u => u && u.startsWith('/uploads/'))
        : [];
      if (attachmentUrls.length && window.cacheUploadUrls) {
        window.cacheUploadUrls(attachmentUrls);
      }
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
    const file = e.target.closest('.file-pill');
    if (avatar) {
      const uname = avatar.dataset.username;
      if (uname) showProfilePopout(uname, e);
    } else if (nameEl) {
      showProfilePopout(nameEl.textContent.trim(), e);
    } else if (media) {
      openLightbox(media);
    } else if (file) {
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
    }
  });
}

export { isDifferentDay, formatTimestamp, formatLongDate, insertDateSeparator, renderTextMessages, initTextChannelEvents, appendNewMessage };
