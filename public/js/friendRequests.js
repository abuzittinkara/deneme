// public/js/friendRequests.js

export function initFriendRequests(socket) {
    // "selected-channel-bar" elementini alıyoruz (arkadaş isteklerinin listeleneceği alan)
    const selectedChannelBar = document.getElementById('selectedChannelBar');
    if (!selectedChannelBar) {
      console.error("selectedChannelBar not found");
      return;
    }
    
    // Arkadaş isteklerini listelemek için kullanılacak kapsayıcıyı oluşturuyoruz (eğer mevcut değilse)
    let friendRequestContainer = document.getElementById('friendRequestContainer');
    if (!friendRequestContainer) {
      friendRequestContainer = document.createElement('div');
      friendRequestContainer.id = 'friendRequestContainer';
      friendRequestContainer.style.marginTop = '10px';
      selectedChannelBar.appendChild(friendRequestContainer);
    }
    
    // DM başlık alanı: "dmChannelTitle" elementini alıyoruz
    const dmChannelTitle = document.getElementById('dmChannelTitle');
    if (!dmChannelTitle) {
      console.error("dmChannelTitle not found");
      return;
    }
    
    // "Arkadaş ekle" butonunu dmChannelTitle içinden data-filter="add" ile seçiyoruz
    const friendAddButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="add"]');
    if (!friendAddButton) {
      console.error("Friend add button not found");
      return;
    }
    
    // "Arkadaş ekle" butonuna tıklayınca, arama kutusunu ekle
    friendAddButton.addEventListener('click', () => {
      // Kapsayıcıyı temizle
      friendRequestContainer.innerHTML = '';
  
      // Arama kutusu (input) oluştur
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'friendSearchInput';
      input.placeholder = 'Kullanıcı adı girin...';
      input.style.padding = '8px';
      input.style.border = '1px solid #666';
      input.style.borderRadius = '6px';
      input.style.width = 'calc(100% - 120px)';
      input.style.marginRight = '8px';
  
      // "Arkadaşlık İsteği Gönder" butonunu oluştur
      const sendButton = document.createElement('button');
      sendButton.textContent = 'Arkadaşlık İsteği Gönder';
      sendButton.id = 'sendFriendRequestButton';
      sendButton.style.padding = '8px 12px';
      sendButton.style.background = '#c61884';
      sendButton.style.border = 'none';
      sendButton.style.borderRadius = '6px';
      sendButton.style.color = '#fff';
      sendButton.style.cursor = 'pointer';
  
      // Input ve butonu kapsayıcıya ekle
      friendRequestContainer.appendChild(input);
      friendRequestContainer.appendChild(sendButton);
  
      // Arkadaşlık isteğini gönderme fonksiyonu
      function sendFriendRequest() {
        const targetUsername = input.value.trim();
        if (targetUsername === '') return;
        socket.emit('sendFriendRequest', { to: targetUsername }, (response) => {
          if (response.success) {
            alert('Arkadaşlık isteği gönderildi.');
            input.value = '';
          } else {
            alert('İstek gönderilemedi: ' + response.message);
          }
        });
      }
  
      // Butona tıklayınca isteği gönder
      sendButton.addEventListener('click', () => {
        sendFriendRequest();
      });
  
      // Input üzerinde Enter tuşuna basılırsa isteği gönder
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sendFriendRequest();
        }
      });
    });
  
    // "Beklemede" (data-filter="sent") ve "Hepsi" (data-filter="all") butonlarının işlevselliğini ekliyoruz.
    const pendingFilterButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="sent"]');
    const acceptedFilterButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="all"]');
  
    if (pendingFilterButton) {
      pendingFilterButton.addEventListener('click', () => {
        friendRequestContainer.innerHTML = '';
        socket.emit('getPendingFriendRequests', {}, (response) => {
          if (response.success && Array.isArray(response.requests)) {
            if (response.requests.length === 0) {
              friendRequestContainer.textContent = 'Beklemede arkadaşlık isteği bulunmuyor.';
            } else {
              const list = document.createElement('ul');
              response.requests.forEach(req => {
                const li = document.createElement('li');
                li.textContent = req.from;
                list.appendChild(li);
              });
              friendRequestContainer.appendChild(list);
            }
          } else {
            friendRequestContainer.textContent = 'İstekler alınırken hata oluştu.';
          }
        });
      });
    }
  
    if (acceptedFilterButton) {
      acceptedFilterButton.addEventListener('click', () => {
        friendRequestContainer.innerHTML = '';
        socket.emit('getAcceptedFriendRequests', {}, (response) => {
          if (response.success && Array.isArray(response.friends)) {
            if (response.friends.length === 0) {
              friendRequestContainer.textContent = 'Hiç arkadaşınız yok.';
            } else {
              const list = document.createElement('ul');
              response.friends.forEach(friend => {
                const li = document.createElement('li');
                li.textContent = friend.username;
                list.appendChild(li);
              });
              friendRequestContainer.appendChild(list);
            }
          } else {
            friendRequestContainer.textContent = 'Arkadaşlar alınırken hata oluştu.';
          }
        });
      });
    }
  }
  