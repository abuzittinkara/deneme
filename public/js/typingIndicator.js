/**************************************
 * typingIndicator.js
 * 
 * Bu modül, metin kanalı seçili iken kullanıcının .text-chat-input-bar 
 * alanında yazı yazdığını algılayıp, 
 * "X yazıyor..." (animasyonlu ellipsis: üç, iki, bir nokta döngüsü)
 * göstergesini ekrana getirmeyi sağlar.
 *
 * Özellikler:
 * - Kullanıcı metin giriş alanına bir şeyler yazdığında, socket üzerinden "typing"
 *   olayı gönderilir ve aynı anda ekranda animasyonlu "X yazıyor..." göstergesi belirir.
 * - Kullanıcı yazmayı durdurduğunda veya mesajı gönderdiğinde "stop typing" olayı gönderilir,
 *   ve gösterge kaldırılır.
 * - Ayrıca, diğer kullanıcılardan gelen "typing" ve "stop typing" event’leri dinlenir;
 *   eğer aynı kanaldaysanız, diğer kullanıcıların yazıyor olduğunu da gösterir.
 * - Göstergenin konumu, .text-chat-input-bar öğesinin hemen üstünde olacak şekilde
 *   (ancak input barın pozisyonunu değiştirmeyecek şekilde) sabit tutulur.
 *
 * Kullanım:
 * import { initTypingIndicator } from './typingIndicator.js';
 * initTypingIndicator(socket);
 **************************************/
export function initTypingIndicator(socket) {
    // .text-chat-input-bar öğesini buluyoruz
    const inputBar = document.querySelector('.text-chat-input-bar');
    if (!inputBar) {
      console.error("Text chat input bar bulunamadı!");
      return;
    }
    
    // Typing indicator için yeni bir element oluşturuyoruz (eğer daha önceden oluşturulmamışsa)
    let typingIndicator = document.getElementById('typingIndicator');
    if (!typingIndicator) {
      typingIndicator = document.createElement('div');
      typingIndicator.id = 'typingIndicator';
      // Konumlandırmayı, inputBar'ın ebeveyninin (container'ın) içine absolute olarak ekleyelim.
      // Bu sayede inputBar'ın konumunu etkilemeyecek.
      typingIndicator.style.position = 'absolute';
      // Örneğin, inputBar'ın üstünden 5px yukarıda
      typingIndicator.style.bottom = (inputBar.offsetHeight + 5) + 'px';
      typingIndicator.style.left = '10px';
      typingIndicator.style.fontSize = '0.9em';
      typingIndicator.style.color = '#aaa';
      // Başlangıçta görünmez olsun
      typingIndicator.style.visibility = 'hidden';
      // InputBar'ın parent elementine ekleyelim (parent'in position: relative olması gerekir)
      inputBar.parentElement.appendChild(typingIndicator);
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
  
    // Kullanıcının inputBar'da yazmaya başladığını tespit etmek için
    inputBar.addEventListener('input', () => {
      const inputText = inputBar.value.trim();
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
      // Sadece aynı text kanalı içindeysek gösterelim ve kendi adımızı hariç tutalım
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
      // Bu değerin global bir değişkende tutulduğunu varsayıyoruz (örneğin, currentTextChannel)
      return currentTextChannel || null;
    }
  }
  