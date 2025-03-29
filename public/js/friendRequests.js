export function initFriendRequests(socket) {
  // Tüm seçili öğelerden "selected" sınıfını kaldıran yardımcı fonksiyon
  function removeSelectedStates() {
    const dmFriendsButtons = document.querySelectorAll('.dm-friends-button.selected');
    dmFriendsButtons.forEach(btn => btn.classList.remove('selected'));
    const selectedFriendItems = document.querySelectorAll('.dm-friend-item.selected');
    selectedFriendItems.forEach(item => item.classList.remove('selected'));
  }

  // dmChannelTitle elementini alıyoruz (dmChannelTitle, dmContentArea ile birlikte dm modunda 
  // üst kısımda yer alacak; dmPanel ise sabit DM listesi ve arama kutusunu barındıracak)
  const dmChannelTitle = document.getElementById('dmChannelTitle');
  if (!dmChannelTitle) {
    console.error("dmChannelTitle not found");
    return;
  }

  // dmContentArea: Filtre butonlarına tıklandığında içeriğin yükleneceği alan
  let dmContentArea = document.getElementById('dmContentArea');
  if (!dmContentArea) {
    dmContentArea = document.createElement('div');
    dmContentArea.id = 'dmContentArea';
    dmContentArea.style.display = 'block';
    dmContentArea.style.width = '100%';
    dmContentArea.style.marginLeft = '0';
    dmContentArea.style.marginTop = '0';
    dmContentArea.style.height = 'calc(100% - 50px)'; // Üstteki dmChannelTitle yüksekliği 50px varsayılıyor
    dmContentArea.style.padding = '0.75rem 1rem';
    dmContentArea.style.boxSizing = 'border-box';
    // dmContentArea’nın dmPanel’den bağımsız olması için; dmPanel’deki diğer içerikleri değiştirmeyeceğiz.
    // Örneğin dmPanel içine eklenmemesi için dmPanel’den ayrı bir yerde (ör. selectedDMBar’nın altına) konumlandırabilirsiniz.
    const selectedDMBar = document.getElementById('selectedDMBar');
    if (selectedDMBar) {
      selectedDMBar.parentNode.insertBefore(dmContentArea, selectedDMBar.nextSibling);
    } else {
      // Eğer selectedDMBar yoksa, fallback olarak dmChannelTitle'nin hemen altına ekleyin:
      dmChannelTitle.parentNode.insertBefore(dmContentArea, dmChannelTitle.nextSibling);
    }
  }

  // BUTONLARIN EVENT HANDLERLARI: (Bu butonlar artık yalnızca dmContentArea’nın içeriğini güncelleyecek)
  // Arkadaş Ekle butonu (data-filter="add")
  const friendAddButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="add"]');
  if (!friendAddButton) {
    console.error("Friend add button not found");
    return;
  }
  friendAddButton.addEventListener('click', () => {
    removeSelectedStates();
    dmContentArea.style.display = 'block';
    dmContentArea.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'friendSearchInput';
    input.placeholder = 'Kullanıcı adı girin...';
    input.className = 'dm-search-input';

    const sendButton = document.createElement('button');
    sendButton.textContent = 'Arkadaşlık İsteği Gönder';
    sendButton.id = 'sendFriendRequestButton';
    sendButton.className = 'dm-send-request-btn';

    dmContentArea.appendChild(input);
    dmContentArea.appendChild(sendButton);

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

  // Beklemede butonu (data-filter="sent")
  const pendingFilterButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="sent"]');
  if (pendingFilterButton) {
    pendingFilterButton.addEventListener('click', () => {
      removeSelectedStates();
      dmContentArea.style.display = 'block';
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

              const profilePic = document.createElement('div');
              profilePic.className = 'user-profile-pic';

              const textSpan = document.createElement('span');
              textSpan.textContent = `${req.from}`;
              
              li.appendChild(profilePic);
              li.appendChild(textSpan);

              const acceptBtn = document.createElement('button');
              acceptBtn.className = 'friend-accept-btn';
              acceptBtn.innerHTML = '<span class="material-icons" style="color: green;">check</span>';
              acceptBtn.addEventListener('click', () => {
                socket.emit('acceptFriendRequest', { from: req.from }, (resp) => {
                  if (resp.success) {
                    alert('Arkadaşlık isteği kabul edildi.');
                    li.classList.remove('selected');
                    li.remove();
                    renderFriendList();
                  } else {
                    alert('İstek kabul edilemedi: ' + resp.message);
                  }
                });
              });

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

  // Hepsi butonu (data-filter="all")
  const acceptedFilterButton = dmChannelTitle.querySelector('.dm-filter-item[data-filter="all"]');
  if (acceptedFilterButton) {
    acceptedFilterButton.addEventListener('click', () => {
      removeSelectedStates();
      dmContentArea.style.display = 'block';
      dmContentArea.innerHTML = '';
      socket.emit('getAcceptedFriendRequests', {}, (response) => {
        if (response.success && Array.isArray(response.friends)) {
          if (response.friends.length === 0) {
            dmContentArea.textContent = 'Hiç arkadaşınız yok.';
          } else {
            response.friends.forEach(friend => {
              const friendItem = createUserItem(friend.username, true);
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
                dmContentArea.innerHTML = 'Bu kişiyle DM mesajları yükleniyor...';
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
              // Hepsi butonunun tıklanması dmContentArea'yı güncelleyecek, dmPanel içeriği (arkadaş listesi, arama kutusu) 
              // değişmeyecek.
              // Eğer daha önce dmPanel içerisine eklenmişse, onu burada kaldırıyoruz:
              const existingFriendItem = document.querySelector('.dm-friend-item');
              if (existingFriendItem) {
                existingFriendItem.remove();
              }
              // NOT: Bu kısım sadece dmContentArea'ya içerik yüklemek için, dmPanel'e dokunulmayacak.
              dmContentArea.appendChild(friendItem);
            });
          }
        } else {
          dmContentArea.textContent = 'Arkadaşlar alınırken hata oluştu.';
        }
      });
    });
  }

  // dmPanel’deki "arkadaşlar" butonunun işlevi: dmPanel içeriğini (arama, dm listesi) render edecek.
  const toggleDMButton = document.getElementById('toggleDMButton');
  if (toggleDMButton) {
    toggleDMButton.addEventListener('click', () => {
      removeSelectedStates();
      renderFriendList();
    });
  }
  
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
  
  function renderFriendList() {
    const dmPanel = document.getElementById('dmPanel');
    if (!dmPanel) {
      console.error("dmPanel not found");
      return;
    }
    dmPanel.style.padding = '0';
    dmPanel.innerHTML = '';
    const dmPanelHeader = document.createElement('div');
    dmPanelHeader.className = 'dm-panel-header';
    dmPanel.appendChild(dmPanelHeader);
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Bir konuşma bulun veya başlatın...';
    searchInput.className = 'dm-search-input';
    searchInput.addEventListener('input', function() {
      const query = searchInput.value.toLowerCase();
      const friendItems = dmPanel.querySelectorAll('.dm-friend-item');
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
  
  // createUserItem fonksiyonu: dmPanel için.
  function createUserItem(username, isOnline) {
    const userItem = document.createElement('div');
    userItem.classList.add('user-item', 'dm-friend-item');
    userItem.style.cursor = 'pointer';
    const avatar = document.createElement('img');
    avatar.classList.add('user-profile-pic');
    avatar.src = '/images/default-avatar.png';
    avatar.alt = '';
    const userNameSpan = document.createElement('span');
    userNameSpan.classList.add('user-name');
    userNameSpan.textContent = username;
    userNameSpan.style.marginLeft = '8px';
    userItem.appendChild(avatar);
    userItem.appendChild(userNameSpan);
    return userItem;
  }
}
