/**************************************
 * typingIndicator.js
 * 
 * Bu modül, metin kanalı seçili iken kullanıcının 
 * metin giriş alanında (id="textChannelMessageInput") yazı yazdığını algılayıp, 
 * "X yazıyor..." (animasyonlu ellipsis: üç, iki, bir nokta döngüsü)
 * göstergesini ekrana getirmeyi sağlar.
 *
 * Özellikler:
 * - Kullanıcı metin giriş alanına bir şeyler yazdığında, socket üzerinden "typing"
 *   olayı gönderilir ve aynı anda ekranda animasyonlu "X yazıyor..." göstergesi belirir.
 * - Kullanıcı yazmayı durdurduğunda veya mesajı gönderdiğinde "stop typing" olayı gönderilir,
 *   ve gösterge kaldırılır.
 * - Diğer kullanıcılardan gelen "typing" ve "stop typing" event’leri de dinlenir.
 * - Göstergenin konumu, metin giriş alanının (inputField'ın) parent öğesinin içinde
 *   absolute olarak yerleştirilir; böylece input alanının konumu sabit kalır.
 *
 * Kullanım:
 * import { initTypingIndicator } from './typingIndicator.js';
 * initTypingIndicator(socket);
 **************************************/
export function initTypingIndicator(socket) {
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
      // Konumlandırma: parent elementin position: relative olduğundan, inputField'ın üstünde yer alacak şekilde absolute konumlandırıyoruz
      typingIndicator.style.position = 'absolute';
      // Örneğin, inputField'ın parent'ının alt kısmında, inputField'ın yüksekliği kadar yukarıda
      typingIndicator.style.bottom = (inputField.parentElement.offsetHeight + 5) + 'px';
      typingIndicator.style.left = '10px';
      typingIndicator.style.fontSize = '0.9em';
      typingIndicator.style.color = '#aaa';
      // Başlangıçta görünmez olsun
      typingIndicator.style.visibility = 'hidden';
      inputField.parentElement.appendChild(typingIndicator);
    }
  
    let typingTimeout = null;
    let ellipsisInterval = null;
    let currentEllipsisState = 3;
  
    // Yerel (local) typing göstergesini başlatır
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
  
    // Input alanında değişiklik olduğunda yazmaya başladığını algılar
    inputField.addEventListener('input', () => {
      const inputText = inputField.value.trim();
      if (inputText !== "") {
        // Yerel olarak "typing" olayını socket'e gönderiyoruz
        socket.emit('typing', { username: username, channel: getCurrentTextChannel() });
        if (!ellipsisInterval) {
          startEllipsisAnimation(username);
        }
        // Önceki timeout'u temizleyip, 3 saniye sonra "stop typing" göndermek için ayarlıyoruz
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
        typingTimeout = setTimeout(() => {
          socket.emit('stop typing', { username: username, channel: getCurrentTextChannel() });
          stopEllipsisAnimation();
        }, 3000);
      } else {
        socket.emit('stop typing', { username: username, channel: getCurrentTextChannel() });
        stopEllipsisAnimation();
      }
    });
  
    // Diğer kullanıcılardan gelen typing eventlerini dinliyoruz
    socket.on('typing', (data) => {
      // data: { username: "X", channel: "kanalID" }
      // Sadece aynı metin kanalındaysak ve kendi adımızı hariç tutuyorsak gösterelim
      if (data.channel === getCurrentTextChannel() && data.username !== username) {
        typingIndicator.style.visibility = 'visible';
        if (!ellipsisInterval) {
          startEllipsisAnimation(data.username);
        }
        // Yaklaşık 3 saniye sonra otomatik olarak göstergeyi kaldır
        setTimeout(() => {
          stopEllipsisAnimation();
        }, 3000);
      }
    });
  
    socket.on('stop typing', (data) => {
      if (data.channel === getCurrentTextChannel() && data.username !== username) {
        stopEllipsisAnimation();
      }
    });
  
    // Geçerli metin kanalının ID'sini döndüren yardımcı fonksiyon
    function getCurrentTextChannel() {
      // Bu değerin global değişken currentTextChannel üzerinden tutulduğunu varsayıyoruz
      return currentTextChannel || null;
    }
  }
  