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

  let typingTimeout = null;
  let ellipsisInterval = null;
  let currentEllipsisState = 3;

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

  // Yeni: Timeout callback fonksiyonu; input boşsa stop, doluysa tekrar kontrol et.
  function scheduleStopTyping() {
    typingTimeout = setTimeout(() => {
      if (inputField.value.trim() === "") {
        socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
        stopEllipsisAnimation();
        typingTimeout = null;
      } else {
        // Input hâlâ dolu, yeniden 3 saniyelik kontrol başlat.
        scheduleStopTyping();
      }
    }, 3000);
  }

  // Yerel input alanındaki değişiklikleri dinliyoruz.
  inputField.addEventListener('input', () => {
    const inputText = inputField.value.trim();
    if (inputText !== "") {
      socket.emit('typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      scheduleStopTyping();
    } else {
      socket.emit('stop typing', { username: getLocalUsername(), channel: getCurrentTextChannel() });
      stopEllipsisAnimation();
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
    }
  });

  // Diğer kullanıcılardan gelen typing eventlerini dinliyoruz.
  socket.on('typing', (data) => {
    // data: { username: "X", channel: "kanalID" }
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      typingIndicator.style.visibility = 'visible';
      if (!ellipsisInterval) {
        startEllipsisAnimation(data.username);
      }
      // Diğer kullanıcıların gösterge için de 3 saniye sonra kapatma tetikleniyor
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
