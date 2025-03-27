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
    // Ayrıca dm-friends-button ve friend-item'lerden seçili durum kaldırılıyor.
    removeSelectedStates();
    
    dmContentArea.style.display = 'block'; // dmContentArea'nın görünür olduğundan emin oluyoruz.
    dmContentArea.innerHTML = '';

    // Arama kutusu (input) oluşturuluyor
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'friendSearchInput';
    input.placeholder = 'Kullanıcı adı girin...';
    // Inline stiller kaldırıldı; artık "dm-search-input" sınıfı üzerinden stil verilecek.
    input.className = 'dm-search-input';

    // "Arkadaşlık İsteği Gönder" butonunu oluşturuluyor
    const sendButton = document.createElement('button');
    sendButton.textContent = 'Arkadaşlık İsteği Gönder';
    sendButton.id = 'sendFriendRequestButton';
    // Inline stiller kaldırıldı (isterseniz CSS üzerinden stillendirin)
    sendButton.className = 'dm-send-request-btn';

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
      removeSelectedStates();
      
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

              // Profil fotoğrafı alanı
              const profilePic = document.createElement('div');
              profilePic.className = 'user-profile-pic';
              // İsteğe bağlı: varsayılan profil fotoğrafı veya arka plan rengi CSS üzerinden ayarlanabilir.

              // Kullanıcı adını gösteren span
              const textSpan = document.createElement('span');
              textSpan.textContent = `${req.from}`;
              
              // Kapsayıcıya ekleyelim
              li.appendChild(profilePic);
              li.appendChild(textSpan);

              // Accept button
              const acceptBtn = document.createElement('button');
              acceptBtn.className = 'friend-accept-btn';
              acceptBtn.innerHTML = '<span class="material-icons" style="color: green;">check</span>';
              acceptBtn.addEventListener('click', () => {
                socket.emit('acceptFriendRequest', { from: req.from }, (resp) => {
                  if (resp.success) {
                    alert('Arkadaşlık isteği kabul edildi.');
                    li.classList.remove('selected');
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
              rejectBtn.className = 'friend-reject-btn';
              rejectBtn.innerHTML = '<span class="material-icons" style="color: red;">close</span>';
              rejectBtn.addEventListener('click', () => {
                socket.emit('rejectFriendRequest', { from: req.from }, (resp) => {
                  if (resp.success) {
                    alert('Arkadaşlık isteği reddedildi.');
                    li.classList.remove('selected');
                    li.remove();
                  } else {
                    alert('İstek reddedilemedi: ' + resp.message);
                  }
                });
              });

              const btnContainer = document.createElement('div');
              btnContainer.appendChild(acceptBtn);
              btnContainer.appendChild(rejectBtn);

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
      removeSelectedStates();
      
      dmContentArea.style.display = 'block'; // Görünür yapıyoruz.
      dmContentArea.innerHTML = '';
      socket.emit('getAcceptedFriendRequests', {}, (response) => {
        if (response.success && Array.isArray(response.friends)) {
          if (response.friends.length === 0) {
            dmContentArea.textContent = 'Hiç arkadaşınız yok.';
          } else {
            response.friends.forEach(friend => {
              const friendItem = createUserItem(friend.username, true);
              // friend-item'e tıklandığında seçili durumu ayarlayalım
              friendItem.addEventListener('click', () => {
                removeSelectedStates();
                friendItem.classList.add('selected');
                const selectedDMBar = document.getElementById('selectedDMBar');
                if (selectedDMBar) {
                  selectedDMBar.innerHTML = '';
                  const h2 = document.createElement('h2');
                  h2.id = 'dmChannelTitle';
                  h2.className = 'dm-channel-title';
                  h2.textContent = friend.username;
                  selectedDMBar.appendChild(h2);
                }
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
      removeSelectedStates();
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
  
    // Yeni: dm-panel-header oluşturuluyor. Inline stiller kaldırıldı; stil ayarları CSS üzerinden uygulanacak.
    const dmPanelHeader = document.createElement('div');
    dmPanelHeader.className = 'dm-panel-header';
    dmPanel.appendChild(dmPanelHeader);
  
    // Arama kutucuğu oluşturuluyor
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    // Güncellendi: placeholder metni "Bir konuşma bulun veya başlatın..." olarak ayarlandı
    searchInput.placeholder = 'Bir konuşma bulun veya başlatın...';
    // Inline stiller kaldırıldı; "dm-search-input" sınıfı eklendi.
    searchInput.className = 'dm-search-input';
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
    friendsButton.innerHTML = '<span class="material-icons dm-group-icon">group</span>Arkadaşlar';
    friendsButton.className = 'dm-friends-button';
    friendsButton.addEventListener('click', () => {
      removeSelectedStates();
      friendsButton.classList.add('selected');
      const selectedDMBar = document.getElementById('selectedDMBar');
      if (selectedDMBar) {
        selectedDMBar.innerHTML = '';
        const h2 = document.createElement('h2');
        h2.id = 'dmChannelTitle';
        h2.className = 'dm-channel-title';
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
            const friendItem = createUserItem(friend.username, true);
            // friend-item'e tıklandığında seçili durumu ayarlayalım
            friendItem.addEventListener('click', () => {
              removeSelectedStates();
              friendItem.classList.add('selected');
              const selectedDMBar = document.getElementById('selectedDMBar');
              if (selectedDMBar) {
                selectedDMBar.innerHTML = '';
                const h2 = document.createElement('h2');
                h2.id = 'dmChannelTitle';
                h2.className = 'dm-channel-title';
                h2.textContent = friend.username;
                selectedDMBar.appendChild(h2);
              }
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
        dmPanel.textContent = 'Arkadaşlar alınırken hata oluştu.';
      }
    });
  }
  
  // Yardımcı fonksiyon: Tüm seçili öğelerden "selected" sınıfını kaldırır.
  function removeSelectedStates() {
    const dmFriendsButtons = document.querySelectorAll('.dm-friends-button.selected');
    dmFriendsButtons.forEach(btn => btn.classList.remove('selected'));
    const selectedFriendItems = document.querySelectorAll('.friend-item.selected');
    selectedFriendItems.forEach(item => item.classList.remove('selected'));
  }
}

/* createUserItem */
function createUserItem(username, isOnline) {
  const userItem = document.createElement('div');
  userItem.classList.add('user-item');
  const profileThumb = document.createElement('div');
  profileThumb.classList.add('profile-thumb');
  profileThumb.style.backgroundColor = isOnline ? '#2dbf2d' : '#777';
  const userNameSpan = document.createElement('span');
  userNameSpan.classList.add('user-name');
  userNameSpan.textContent = username;
  userItem.appendChild(profileThumb);
  userItem.appendChild(userNameSpan);
  return userItem;
}
