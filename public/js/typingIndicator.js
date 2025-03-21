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
 * “X yazıyor...” mesajını gösterir.
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
    // Başlangıçta aktif kanal bilgisini set ediyoruz
    typingIndicator.setAttribute('data-channel', getCurrentTextChannel());
    inputField.parentElement.appendChild(typingIndicator);
  }

  let typingInterval = null; // Yerel kullanıcının typing event’ini periyodik göndermek için

  // Basit, sabit metin gösterecek fonksiyon (animasyon kaldırıldı)
  function showStaticTyping(username) {
    const currentChannel = getCurrentTextChannel();
    // Typing indicator sadece aktif kanal için gösterilsin
    if (typingIndicator.getAttribute('data-channel') !== currentChannel) {
      typingIndicator.style.visibility = 'hidden';
      return;
    }
    typingIndicator.style.visibility = 'visible';
    typingIndicator.textContent = username + " yazıyor...";
  }

  function hideTyping() {
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
    socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
    typingIndicator.style.visibility = 'hidden';
  }

  // Kanal değişikliği durumunda typing indicator'ı güncellemek için event listener ekliyoruz.
  // Eğer kanal değiştiyse, indicator'ın data-channel attribute'unu güncelliyoruz ve görünürlüğünü kapatıyoruz.
  socket.on('updateCurrentChannel', (data) => {
    if (typingIndicator && data && data.channel) {
      typingIndicator.setAttribute('data-channel', data.channel);
      typingIndicator.style.visibility = 'hidden';
    }
  });

  // Alternatif olarak, channel change için global bir custom event dinleyicisi ekliyoruz.
  document.addEventListener('channelChanged', (e) => {
    if (typingIndicator && e.detail && e.detail.newChannel) {
      typingIndicator.setAttribute('data-channel', e.detail.newChannel);
      typingIndicator.style.visibility = 'hidden';
    }
  });

  // Yerel input alanındaki değişiklikleri dinliyoruz.
  inputField.addEventListener('input', () => {
    // Her input değişiminde indicator'ın data-channel attribute'unu güncelliyoruz.
    typingIndicator.setAttribute('data-channel', getCurrentTextChannel());
    const inputText = inputField.value.trim();
    if (inputText !== "") {
      socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
      // Eğer henüz periyodik typing interval başlamadıysa başlatıyoruz
      if (!typingInterval) {
        typingInterval = setInterval(() => {
          if (inputField.value.trim() !== "") {
            socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
          } else {
            hideTyping();
          }
        }, 2000);
      }
    } else {
      hideTyping();
    }
  });

  // Diğer kullanıcılardan gelen typing eventlerini dinliyoruz.
  socket.on('typing', (data) => {
    // data: { username: "X", channel: "kanalID" }
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      showStaticTyping(data.username);
    }
  });

  socket.on('stop typing', (data) => {
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      typingIndicator.style.visibility = 'hidden';
    }
  });
}
