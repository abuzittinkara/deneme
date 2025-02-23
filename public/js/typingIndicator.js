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
    inputField.parentElement.appendChild(typingIndicator);
  }

  let typingInterval = null; // Yerel kullanıcının typing event’ini periyodik göndermek için

  // Basit, sabit metin gösterecek fonksiyon (animasyon kaldırıldı)
  function showStaticTyping(username) {
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

  // Yerel input alanındaki değişiklikleri dinliyoruz.
  inputField.addEventListener('input', () => {
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
      // Diğer kullanıcının typing event'ini aldığımızda sabit metni gösteriyoruz
      showStaticTyping(data.username);
    }
  });

  socket.on('stop typing', (data) => {
    if (data.channel === getCurrentTextChannel() && data.username !== getLocalUsername()) {
      typingIndicator.style.visibility = 'hidden';
    }
  });
}
