/**************************************
 * typingIndicator.js
 * 
 * Bu modül, metin kanalı seçili iken kullanıcının 
 * metin giriş alanında (id="textChannelMessageInput") yazı yazdığını algılayıp, 
 * "X yazıyor..." (animasyonlu ellipsis: üç, iki, bir nokta döngüsü)
 * göstergesini, yalnızca diğer kullanıcılar için ekrana getirmeyi sağlar.
 *
 * Özellikler:
 * - Yerel kullanıcı (giriş yapmış kullanıcı) kendi yazarken, ekranında hiçbir typing
 *   göstergesi görünmez; socket üzerinden "typing" olayı gönderilir.
 * - Diğer kullanıcılardan gelen "typing" event’leri dinlenir; eğer aynı kanalda iseler,
 *   diğer kullanıcının adını kullanarak animasyonlu typing göstergesi (örneğin "X yazıyor...") 
 *   ekranda görünür.
 * - Kullanıcı yazmayı durdurduğunda veya mesaj gönderdiğinde "stop typing" olayı gönderilir
 *   ve gösterge kaldırılır.
 *
 * Kullanım:
 * import { initTypingIndicator } from './js/typingIndicator.js';
 * initTypingIndicator(socket, () => currentTextChannel, username);
 **************************************/
export function initTypingIndicator(socket, getCurrentTextChannel, localUsername) {
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
      // Örneğin, inputField'ın parent'ının alt kısmında, inputField'ın yüksekliği kadar yukarıda (5px boşlukla)
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
  
    // Yerel typing göstergesini başlatır (sadece diğer kullanıcılardan gelen eventlerde çalışır)
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
    // Dikkat: Yerel kullanıcı kendi yazarken ekranında typing göstergesi göstermiyoruz.
    inputField.addEventListener('input', () => {
      const inputText = inputField.value.trim();
      if (inputText !== "") {
        socket.emit('typing', { username: localUsername, channel: getCurrentTextChannel() });
        // Yerel kullanıcı kendi ekranında typing göstergesi görmek istemediğinden
        // burada startEllipsisAnimation(localUsername) çağrılmıyor.
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
        typingTimeout = setTimeout(() => {
          socket.emit('stop typing', { username: localUsername, channel: getCurrentTextChannel() });
          stopEllipsisAnimation();
        }, 3000);
      } else {
        socket.emit('stop typing', { username: localUsername, channel: getCurrentTextChannel() });
        stopEllipsisAnimation();
      }
    });
  
    // Diğer kullanıcılardan gelen typing eventlerini dinliyoruz.
    socket.on('typing', (data) => {
      // data: { username: "X", channel: "kanalID" }
      // Sadece aynı metin kanalındaysak ve gelen kullanıcı yerel kullanıcı değilse gösterelim.
      if (data.channel === getCurrentTextChannel() && data.username !== localUsername) {
        typingIndicator.style.visibility = 'visible';
        if (!ellipsisInterval) {
          startEllipsisAnimation(data.username);
        }
        setTimeout(() => {
          stopEllipsisAnimation();
        }, 3000);
      }
    });
  
    socket.on('stop typing', (data) => {
      if (data.channel === getCurrentTextChannel() && data.username !== localUsername) {
        stopEllipsisAnimation();
      }
    });
  }
  