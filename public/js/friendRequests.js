// public/js/friendRequests.js

export function initFriendRequests(socket) {
  // "selectedChannelBar" elementini alıyoruz (DM içerik alanının ekleneceği yer)
  const selectedChannelBar = document.getElementById('selectedChannelBar');
  if (!selectedChannelBar) {
    console.error("selectedChannelBar not found");
    return;
  }

  // selectedChannelBar'ı dikey (column) yerleşimli yapıyoruz.
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
  // çünkü DM tuşuna basılmadığı sürece gözükmesi istenmiyor.

  // DM içerik alanı oluşturuluyor, dmChannelTitle'ın altında ayrı bir satırda.
  let dmContentArea = document.getElementById('dmContentArea');
  if (!dmContentArea) {
    dmContentArea = document.createElement('div');
    dmContentArea.id = 'dmContentArea';
    dmContentArea.style.display = 'block';
    dmContentArea.style.width = '100%';
    dmContentArea.style.marginLeft = '0';
    dmContentArea.style.marginTop = '0'; // Boşluk bırakmıyoruz.
    dmContentArea.style.height = 'calc(100% - 50px)'; // selectedChannelBar'ın yüksekliği 50px olduğundan kalan alanı kaplasın.
    dmContentArea.style.padding = '0.75rem 1rem';
    dmContentArea.style.boxSizing = 'border-box';
    selectedChannelBar.parentNode.insertBefore(dmContentArea, selectedChannelBar.nextSibling);
  }
  
  // "Arkadaş ekle" butonunu dmChannelTitle içinden data-filter="add" ile seçiyoruz.
  const friendAddButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="add"]');
  if (!friendAddButton) {
    console.error("Friend add button not found");
    return;
  }
  
  // "Arkadaş ekle" butonuna tıklayınca, dmContentArea içerisine arama kutusu eklenir.
  friendAddButton.addEventListener('click', () => {
    dmContentArea.style.display = 'block'; // dmContentArea'nın görünür olduğundan emin oluyoruz.
    dmContentArea.innerHTML = '';

    // Arama kutusu (input) oluşturuluyor
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'friendSearchInput';
    input.placeholder = 'Kullanıcı adı girin...';
    input.style.padding = '8px';
    input.style.border = '1px solid #666';
    input.style.borderRadius = '6px';
    input.style.width = 'calc(100% - 120px)';
    input.style.marginRight = '8px';

    // "Arkadaşlık İsteği Gönder" butonunu oluşturuluyor
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
      dmContentArea.style.display = 'block'; // Görünür yapıyoruz.
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
                    // Refresh friend list after accepting
                    renderFriendList();
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
      dmContentArea.style.display = 'block'; // Görünür yapıyoruz.
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
  
  // Yeni ek: dmPanel'in sol tarafında (dmPanel içeriği) arkadaş listesini oluşturmak
  // Kullanıcı "toggleDMButton"a tıkladığında dmPanel içerisinde arkadaş listesinin otomatik gelmesi sağlanacak.
  const toggleDMButton = document.getElementById('toggleDMButton');
  if (toggleDMButton) {
    toggleDMButton.addEventListener('click', () => {
      renderFriendList();
    });
  }
  
  // Fonksiyon: Varsayılan dmChannelTitle içeriğini döndüren fonksiyon
  function getDefaultDmChannelTitleHtml() {
    return `
      <span class="dm-title-text">Arkadaşlar</span>
      <span class="dm-divider"></span>
      <span class="dm-filter-item" data-filter="online">Çevrimiçi</span>
      <span class="dm-filter-item" data-filter="all">Hepsi</span>
      <span class="dm-filter-item" data-filter="sent">Beklemede</span>
      <span class="dm-filter-item" data-filter="blocked">Engellenen</span>
      <span class="dm-filter-item" data-filter="add">Arkadaş ekle</span>
    `;
  }
  
  // Fonksiyon: dmPanel'e arkadaş listesini render eder
  function renderFriendList() {
    const dmPanel = document.getElementById('dmPanel');
    if (!dmPanel) {
      console.error("dmPanel not found");
      return;
    }
    // dmPanel'in padding'ini 0 yapıyoruz.
    dmPanel.style.padding = '0';

    // dmPanel içeriğini temizle
    dmPanel.innerHTML = '';

    // Yeni: dm-panel-header oluşturuluyor ve ölçüleri 268x25, padding-top/bottom 12px, padding-left/right 16px, border-bottom 1px solid #444; ayrıca en üste yapışık ve ortalanmış
    const dmPanelHeader = document.createElement('div');
    dmPanelHeader.className = 'dm-panel-header';
    dmPanelHeader.style.width = '268px';
    dmPanelHeader.style.height = '25px';
    dmPanelHeader.style.backgroundColor = '#333';
    dmPanelHeader.style.display = 'flex';
    dmPanelHeader.style.alignItems = 'center';
    dmPanelHeader.style.justifyContent = 'center';
    dmPanelHeader.style.position = 'sticky';
    dmPanelHeader.style.top = '0';
    dmPanelHeader.style.margin = '0 auto';
    dmPanelHeader.style.padding = '12px 16px';
    dmPanelHeader.style.borderBottom = '1px solid #444';
    // Arama kutucuğu oluşturuluyor
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    // Güncellendi: placeholder metni "Bir konuşma bulun veya başlatın..." olarak ayarlandı
    searchInput.placeholder = 'Bir konuşma bulun veya başlatın...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '4px 8px'; // padding-top/bottom 4px, left/right 8px
    searchInput.style.border = '1px solid #444';
    searchInput.style.borderRadius = '4px';
    searchInput.style.backgroundColor = '#1e1e1e'; // Arka plan rengi
    searchInput.style.color = '#fff'; // Yazı rengi
    searchInput.addEventListener('input', function() {
      const query = searchInput.value.toLowerCase();
      const friendItems = dmPanel.querySelectorAll('.friend-item');
      friendItems.forEach(item => {
        if(item.textContent.toLowerCase().indexOf(query) > -1) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    });
    dmPanelHeader.appendChild(searchInput);
    dmPanel.appendChild(dmPanelHeader);

    // Üstte "Arkadaşlar" butonunu ekle ve tıklandığında dmChannelTitle'in içeriğini resetle
    const friendsButton = document.createElement('button');
    // Butonun içeriğine ikon ekleniyor; inline stiller kaldırılarak "dm-group-icon" sınıfı ekleniyor.
    friendsButton.innerHTML = '<span class="material-icons dm-group-icon">group</span>Arkadaşlar';
    friendsButton.style.width = '100%';
    friendsButton.style.padding = '10px';
    friendsButton.style.background = '#2d2d2d';
    friendsButton.style.color = '#aaa';
    friendsButton.style.border = 'none';
    friendsButton.style.cursor = 'pointer';
    friendsButton.style.textAlign = 'left';
    friendsButton.addEventListener('mouseover', () => {
      friendsButton.style.background = '#1e1e1e';
    });
    friendsButton.addEventListener('mouseout', () => {
      friendsButton.style.background = '#2d2d2d';
    });
    friendsButton.addEventListener('click', () => {
      const selectedDMBar = document.getElementById('selectedDMBar');
      if (selectedDMBar) {
        selectedDMBar.innerHTML = '';
        const h2 = document.createElement('h2');
        h2.id = 'dmChannelTitle';
        h2.className = 'dm-channel-title';
        h2.style.margin = '0';
        h2.style.borderBottom = '1px solid #ccc';
        h2.style.padding = '0.5rem 0';
        h2.style.display = 'flex';
        h2.style.alignItems = 'center';
        h2.style.justifyContent = 'flex-start';
        h2.innerHTML = getDefaultDmChannelTitleHtml();
        selectedDMBar.appendChild(h2);
      }
      const dmContentArea = document.getElementById('dmContentArea');
      if (dmContentArea) {
        dmContentArea.innerHTML = '';
      }
    });
    dmPanel.appendChild(friendsButton);

    // Arkadaş listesini sunucudan alalım
    socket.emit('getAcceptedFriendRequests', {}, (response) => {
      if (response.success && Array.isArray(response.friends)) {
        if (response.friends.length === 0) {
          const noFriends = document.createElement('div');
          noFriends.textContent = 'Hiç arkadaşınız yok.';
          noFriends.style.padding = '10px';
          dmPanel.appendChild(noFriends);
        } else {
          response.friends.forEach(friend => {
            const friendItem = document.createElement('div');
            friendItem.className = 'friend-item';
            friendItem.textContent = friend.username;
            friendItem.style.padding = '10px';
            friendItem.style.borderBottom = '1px solid #444';
            friendItem.style.cursor = 'pointer';
            friendItem.addEventListener('click', () => {
              // Arkadaş listesinde bir arkadaşa tıklanırsa,
              // selectedDMBar'da o arkadaşın kullanıcı adını göster
              const selectedDMBar = document.getElementById('selectedDMBar');
              if (selectedDMBar) {
                selectedDMBar.innerHTML = '';
                const h2 = document.createElement('h2');
                h2.id = 'dmChannelTitle';
                h2.className = 'dm-channel-title';
                h2.style.margin = '0';
                h2.style.borderBottom = '1px solid #ccc';
                h2.style.padding = '0.5rem 0';
                h2.style.display = 'flex';
                h2.style.alignItems = 'center';
                h2.style.justifyContent = 'flex-start';
                h2.textContent = friend.username;
                selectedDMBar.appendChild(h2);
              }
              // dmContentArea'da bu arkadaşıyla olan mesajları yükle
              const dmContentArea = document.getElementById('dmContentArea');
              if (dmContentArea) {
                dmContentArea.innerHTML = 'Bu kişiyle DM mesajları yükleniyor...';
              }
              socket.emit('joinDM', { friend: friend.username }, (res) => {
                if (res.success && res.messages) {
                  dmContentArea.innerHTML = '';
                  res.messages.forEach(msg => {
                    const msgDiv = document.createElement('div');
                    msgDiv.textContent = `${msg.username}: ${msg.content}`;
                    dmContentArea.appendChild(msgDiv);
                  });
                } else {
                  dmContentArea.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
                }
              });
            });
            dmPanel.appendChild(friendItem);
          });
        }
      } else {
        const errorDiv = document.createElement('div');
        errorDiv.textContent = 'Arkadaşlar alınırken hata oluştu.';
        errorDiv.style.padding = '10px';
        dmPanel.appendChild(errorDiv);
      }
    });
  }
}
