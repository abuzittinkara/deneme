/**************************************
 * typingIndicator.js
 * 
 * Bu modül, metin kanalı seçili iken kullanıcının 
 * metin giriş alanında (id="textChannelMessageInput") yazı yazdığını algılayıp, 
 * "X yazıyor..." göstergesini, yalnızca diğer kullanıcılara gösterecek şekilde çalışır.
 *
 * Yerel kullanıcı kendi yazarken ekranında typing göstergesi görünmez.
 * Socket üzerinden “typing” ve “stop typing” event’leri gönderilir; 
 * diğer istemciler (aynı text kanalda) bu event’leri aldığında ilgili kullanıcının adını kullanarak 
 * “X yazıyor…” mesajını gösterir.
 *
 * Kullanım:
 * import { initTypingIndicator } from './js/typingIndicator.js';
 * initTypingIndicator(socket, () => currentTextChannel, () => username);
 **************************************/
export function initTypingIndicator(socket, getCurrentTextChannel, getLocalUsername) {
  // Metin giriş alanını alıyoruz (input elementi)
  const inputField = document.getElementById('textChannelMessageInput');
  if (!inputField) {
    console.error("Text chat input field (id='textChannelMessageInput') bulunamadı!");
    return;
  }
  
  // Typing indicator için container: inputField'ın parent elementini kullanıyoruz
  let typingIndicator = document.getElementById('typingIndicator');
  if (!typingIndicator) {
    typingIndicator = document.createElement('div');
    typingIndicator.id = 'typingIndicator';
    // Konumlandırma: inputField'ın parent öğesinin position: relative olduğunu varsayarak absolute konumlandırıyoruz.
    typingIndicator.style.position = 'absolute';
    // inputField'ın hemen altında, 5px boşluk bırakacak şekilde konumlandırıyoruz.
    typingIndicator.style.top = "calc(100% + 5px)";
    typingIndicator.style.left = "10px";
    typingIndicator.style.fontSize = '0.9em';
    typingIndicator.style.color = '#aaa';
    // Başlangıçta görünmez olsun
    typingIndicator.style.visibility = 'hidden';
    // Indicator'ın bağlı olduğu kanal bilgisini saklamak için attribute ekliyoruz
    typingIndicator.setAttribute('data-channel', getCurrentTextChannel());
    inputField.parentElement.appendChild(typingIndicator);
  }
  
  // Aktif kanalda diğer kullanıcıların typing eventlerini saklamak için bir set kullanıyoruz
  let activeTypers = new Set();
  
  // Typing indicator'ı güncelleyen yardımcı fonksiyon
  function updateIndicator() {
    if (activeTypers.size > 0) {
      const names = Array.from(activeTypers).join(', ');
      typingIndicator.textContent = names + " yazıyor...";
      typingIndicator.style.visibility = 'visible';
    } else {
      typingIndicator.textContent = "";
      typingIndicator.style.visibility = 'hidden';
    }
  }
  
  // Diğer kullanıcılardan gelen typing eventlerini dinliyoruz
  socket.on('typing', (data) => {
    // data: { username, channel }
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      activeTypers.add(data.username);
      updateIndicator();
    }
  });
  
  socket.on('stop typing', (data) => {
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      activeTypers.delete(data.username);
      updateIndicator();
    }
  });
  
  // Yerel input alanındaki değişiklikleri dinliyoruz.
  // NOT: Yerel kullanıcı kendi typing event’lerini indicator’a eklemiyoruz.
  let typingInterval = null;
  inputField.addEventListener('input', () => {
    // Her input değişiminde indicator'ın bağlı olduğu kanal bilgisini güncelliyoruz.
    typingIndicator.setAttribute('data-channel', getCurrentTextChannel());
    const inputText = inputField.value.trim();
    if (inputText !== "") {
      socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
      if (!typingInterval) {
        typingInterval = setInterval(() => {
          if (inputField.value.trim() !== "") {
            socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
          } else {
            clearInterval(typingInterval);
            typingInterval = null;
            socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
          }
        }, 2000);
      }
    } else {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
    }
  });
  
  // Fonksiyon: Kanal değişikliğini kontrol eder.
  // Eğer getCurrentTextChannel() değeri, indicator'ın mevcut "data-channel" attribute'undan farklıysa,
  // indicator güncellenir, aktif typing listesi temizlenir.
  function checkChannelChange() {
    const currentChannel = getCurrentTextChannel();
    if (typingIndicator.getAttribute('data-channel') !== currentChannel) {
      typingIndicator.setAttribute('data-channel', currentChannel);
      activeTypers.clear();
      updateIndicator();
    }
  }
  
  // Kanal değişikliğini düzenli olarak kontrol etmek için polling ekliyoruz (500ms aralıkla).
  setInterval(checkChannelChange, 500);
  
  // Ayrıca socket üzerinden veya global event üzerinden kanal değişikliğini dinlemeye çalışıyoruz:
  socket.on('updateCurrentChannel', (data) => {
    if (data && data.channel) {
      typingIndicator.setAttribute('data-channel', data.channel);
      activeTypers.clear();
      updateIndicator();
    }
  });
  
  document.addEventListener('channelChanged', (e) => {
    if (e.detail && e.detail.newChannel) {
      typingIndicator.setAttribute('data-channel', e.detail.newChannel);
      activeTypers.clear();
      updateIndicator();
    }
  });
}
