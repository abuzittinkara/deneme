/**************************************
 * typingIndicator.js
 * 
 * Bu modül, metin kanalı seçili iken kullanıcının 
 * metin giriş alanında (id="textChannelMessageInput") yazı yazdığını algılayıp, 
 * "X yazıyor..." (animasyonlu ellipsis: üç, iki, bir nokta döngüsü)
 * göstergesini, yalnızca diğer kullanıcılara gösterecek şekilde çalışır.
 *
 * Yerel kullanıcı kendi yazarken ekranında typing göstergesi görünmez.
 * Socket üzerinden “typing” ve “stop typing” event’leri gönderilir; 
 * diğer istemciler (aynı text kanalda) bu event’leri aldığında ilgili kullanıcının adını kullanarak 
 * “X yazıyor…” animasyonunu gösterir.
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
    inputField.parentElement.appendChild(typingIndicator);
  }

  let ellipsisInterval = null;
  let currentEllipsisState = 3;
  let typingInterval = null; // YENİ: Periyodik typing event için interval

  // Diğer kullanıcılardan gelen event’lerde kullanılacak animasyon fonksiyonu
  function startEllipsisAnimation(username) {
    typingIndicator.style.visibility = 'visible';
    typingIndicator.textContent = username + " yazıyor" + ".".repeat(currentEllipsisState);
    ellipsisInterval = setInterval(() => {
      currentEllipsisState--;
      if (currentEllipsisState < 1) {
        currentEllipsisState = 3;
      }
      typingIndicator.textContent = username + " yazıyor" + ".".repeat(currentEllipsisState);
    }, 500);
  }

  function stopEllipsisAnimation() {
    clearInterval(ellipsisInterval);
    ellipsisInterval = null;
    currentEllipsisState = 3;
    typingIndicator.style.visibility = 'hidden';
  }

  // Yerel input alanındaki değişiklikleri dinliyoruz.
  inputField.addEventListener('input', () => {
    const inputText = inputField.value.trim();
    if (inputText !== "") {
      // Kullanıcı input alanında metin varsa, 'typing' eventini gönder
      socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
      // Eğer periyodik typing interval başlamamışsa, başlatıyoruz
      if (!typingInterval) {
        typingInterval = setInterval(() => {
          // Her periyotta input alanını kontrol ediyoruz; boş değilse 'typing' eventini tekrar gönderiyoruz
          if (inputField.value.trim() !== "") {
            socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
          } else {
            clearInterval(typingInterval);
            typingInterval = null;
            socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
            stopEllipsisAnimation();
          }
        }, 2000);
      }
    } else {
      // Input alanı boşsa, 'stop typing' eventini gönder ve interval varsa temizle
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
      stopEllipsisAnimation();
    }
  });

  // Diğer kullanıcılardan gelen typing eventlerini dinliyoruz.
  socket.on('typing', (data) => {
    // data: { username: "X", channel: "kanalID" }
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      // Başka bir kullanıcı yazıyor ise indicator'ı gösteriyoruz
      typingIndicator.style.visibility = 'visible';
      if (!ellipsisInterval) {
        startEllipsisAnimation(data.username);
      }
      // Belirli bir süre sonra indicator otomatik olarak gizlenecek (3 saniye)
      setTimeout(() => {
        stopEllipsisAnimation();
      }, 3000);
    }
  });

  socket.on('stop typing', (data) => {
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      stopEllipsisAnimation();
    }
  });
}
