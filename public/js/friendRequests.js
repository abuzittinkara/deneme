// public/js/friendRequests.js

export function initFriendRequests(socket) {
  // "selectedChannelBar" elementini alıyoruz (DM içerik alanının ekleneceği yer)
  const selectedChannelBar = document.getElementById('selectedChannelBar');
  if (!selectedChannelBar) {
    console.error("selectedChannelBar not found");
    return;
  }

  // selectedChannelBar'ı dikey (column) yerleşimli yapıyoruz.
  // Böylece dmChannelTitle üstte, dmContentArea altta konumlanır.
  selectedChannelBar.style.display = 'flex';
  selectedChannelBar.style.flexDirection = 'column';

  // DM başlık alanı: "dmChannelTitle" elementini alıyoruz
  // (HTML'de style="display: none;" şeklinde gizlenmiş olarak duracak)
  const dmChannelTitle = document.getElementById('dmChannelTitle');
  if (!dmChannelTitle) {
    console.error("dmChannelTitle not found");
    return;
  }
  // ÖNEMLİ: Burada dmChannelTitle’a .style.display = 'block' atamadık,
  // çünkü DM tuşuna basılmadığı sürece gözükmemesi isteniyor.

  // DM içerik alanı oluşturuluyor.
  // Önceden dmContentArea, selectedChannelBar'ın sonraki kardeşi olarak ekleniyordu.
  // Şimdi dmContentArea, dmPanel'in içine ekleniyor.
  let dmContentArea = document.getElementById('dmContentArea');
  if (!dmContentArea) {
    dmContentArea = document.createElement('div');
    dmContentArea.id = 'dmContentArea';
    dmContentArea.style.display = 'block';
    dmContentArea.style.width = '100%';
    dmContentArea.style.marginLeft = '0';
    dmContentArea.style.marginTop = '0'; // Boşluk bırakmıyoruz.
    dmContentArea.style.height = 'calc(100% - 50px)'; // selectedChannelBar'ın yüksekliği 50px olduğundan kalan alanı kaplasın.
    // Eklenen padding ve box-sizing: border-box sayesinde içerikler kutu sınırları içinde kalacak.
    dmContentArea.style.padding = '0.75rem 1rem';
    dmContentArea.style.boxSizing = 'border-box';
    // dmPanel'i alıp, dmContentArea'yı onun içine ekliyoruz.
    const dmPanel = document.getElementById('dmPanel');
    if (dmPanel) {
      dmPanel.appendChild(dmContentArea);
    } else {
      console.error("dmPanel not found");
    }
  }
  
  // "Arkadaş ekle" butonunu dmChannelTitle içinden data-filter="add" ile seçiyoruz
  const friendAddButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="add"]');
  if (!friendAddButton) {
    console.error("Friend add button not found");
    return;
  }
  
  // "Arkadaş ekle" butonuna tıklayınca, dmContentArea içerisine arama kutusu eklenir
  friendAddButton.addEventListener('click', () => {
    dmContentArea.innerHTML = '';

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

    dmContentArea.appendChild(input);
    dmContentArea.appendChild(sendButton);

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

    sendButton.addEventListener('click', () => {
      sendFriendRequest();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendFriendRequest();
      }
    });
  });
  
  // "Beklemede" (data-filter="sent") butonunun işlevselliği
  const pendingFilterButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="sent"]');
  if (pendingFilterButton) {
    pendingFilterButton.addEventListener('click', () => {
      dmContentArea.innerHTML = '';
      socket.emit('getPendingFriendRequests', {}, (response) => {
        if (response.success && Array.isArray(response.requests)) {
          if (response.requests.length === 0) {
            dmContentArea.textContent = 'Beklemede arkadaşlık isteği bulunmuyor.';
          } else {
            const list = document.createElement('ul');
            response.requests.forEach(req => {
              const li = document.createElement('li');
              li.style.display = 'flex';
              li.style.alignItems = 'center';
              li.style.justifyContent = 'space-between';
              li.style.padding = '5px 0';

              const textSpan = document.createElement('span');
              textSpan.textContent = `${req.from} adlı kullanıcıdan gelen istek`;

              // Accept button
              const acceptBtn = document.createElement('button');
              acceptBtn.style.marginRight = '5px';
              acceptBtn.style.cursor = 'pointer';
              acceptBtn.style.background = 'transparent';
              acceptBtn.style.border = 'none';
              acceptBtn.innerHTML = '<span class="material-icons" style="color: green;">check</span>';
              acceptBtn.addEventListener('click', () => {
                socket.emit('acceptFriendRequest', { from: req.from }, (resp) => {
                  if (resp.success) {
                    alert('Arkadaşlık isteği kabul edildi.');
                    li.remove();
                  } else {
                    alert('İstek kabul edilemedi: ' + resp.message);
                  }
                });
              });

              // Reject button
              const rejectBtn = document.createElement('button');
              rejectBtn.style.cursor = 'pointer';
              rejectBtn.style.background = 'transparent';
              rejectBtn.style.border = 'none';
              rejectBtn.innerHTML = '<span class="material-icons" style="color: red;">close</span>';
              rejectBtn.addEventListener('click', () => {
                socket.emit('rejectFriendRequest', { from: req.from }, (resp) => {
                  if (resp.success) {
                    alert('Arkadaşlık isteği reddedildi.');
                    li.remove();
                  } else {
                    alert('İstek reddedilemedi: ' + resp.message);
                  }
                });
              });

              const btnContainer = document.createElement('div');
              btnContainer.appendChild(acceptBtn);
              btnContainer.appendChild(rejectBtn);

              li.appendChild(textSpan);
              li.appendChild(btnContainer);
              list.appendChild(li);
            });
            dmContentArea.appendChild(list);
          }
        } else {
          dmContentArea.textContent = 'İstekler alınırken hata oluştu.';
        }
      });
    });
  }
  
  // "Hepsi" (data-filter="all") butonunun işlevselliği
  const acceptedFilterButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="all"]');
  if (acceptedFilterButton) {
    acceptedFilterButton.addEventListener('click', () => {
      dmContentArea.innerHTML = '';
      socket.emit('getAcceptedFriendRequests', {}, (response) => {
        if (response.success && Array.isArray(response.friends)) {
          if (response.friends.length === 0) {
            dmContentArea.textContent = 'Hiç arkadaşınız yok.';
          } else {
            const list = document.createElement('ul');
            response.friends.forEach(friend => {
              const li = document.createElement('li');
              li.textContent = friend.username;
              list.appendChild(li);
            });
            dmContentArea.appendChild(list);
          }
        } else {
          dmContentArea.textContent = 'Arkadaşlar alınırken hata oluştu.';
        }
      });
    });
  }
}
