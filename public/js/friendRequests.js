// public/js/friendRequests.js
export function initFriendRequests(socket) {
  // Tüm seçili öğelerden "selected" sınıfını kaldıran yardımcı fonksiyon
  function removeSelectedStates() {
    const dmFriendsButtons = document.querySelectorAll('.dm-friends-button.selected');
    dmFriendsButtons.forEach(btn => btn.classList.remove('selected'));
    const selectedContentItems = document.querySelectorAll('.dm-content-item.selected');
    selectedContentItems.forEach(item => item.classList.remove('selected'));
  }

  // dmChannelTitle elementini alıyoruz (dmChannelTitle, dmContentArea ile birlikte dm modunda 
  // üst kısımda yer alacak; dmPanel ise sabit DM listesi ve arama kutusunu barındıracak)
  let dmChannelTitle = document.getElementById('dmChannelTitle');
  if (!dmChannelTitle) {
    console.error("dmChannelTitle not found");
    return;
  }

  // Eğer dmContentArea hâlihazırda yoksa, oluşturup selectedDMBar'ın hemen altına ekliyoruz.
  function ensureDmContentArea() {
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
      const selectedDMBar = document.getElementById('selectedDMBar');
      if (selectedDMBar) {
        selectedDMBar.parentNode.insertBefore(dmContentArea, selectedDMBar.nextSibling);
      } else {
        dmChannelTitle.parentNode.insertBefore(dmContentArea, dmChannelTitle.nextSibling);
      }
    }
    return dmContentArea;
  }

  // Yardımcı fonksiyon: dmContentArea'ya eklenmek üzere dm içerik elemanı oluşturur.
  function createDmContentItem(text) {
    const div = document.createElement('div');
    div.className = 'dm-content-item';
    div.textContent = text;
    return div;
  }

  // --- Orijinal bireysel dm-filter-item event listener blokları kaldırıldı ---
  // (Artık dm-filter-item tıklamaları, aşağıdaki event delegation sayesinde yakalanacak.)

  // --- Yeni: Event Delegation for dm-filter-item clicks ---
  const selectedDMBar = document.getElementById('selectedDMBar');
  if (selectedDMBar) {
    selectedDMBar.addEventListener('click', (e) => {
      const filterItem = e.target.closest('.dm-filter-item');
      if (!filterItem) return;
      const filter = filterItem.getAttribute('data-filter');
      removeSelectedStates();
      // dmContentArea hazırla ve içeriğini temizle.
      const dmContentArea = ensureDmContentArea();
      dmContentArea.style.display = 'block';
      dmContentArea.innerHTML = '';

      if (filter === 'add') {
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

        sendButton.addEventListener('click', sendFriendRequest);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            sendFriendRequest();
          }
        });
      } else if (filter === 'sent') {
        socket.emit('getPendingFriendRequests', {}, (incomingResponse) => {
          socket.emit('getOutgoingFriendRequests', {}, (outgoingResponse) => {
            const incomingHeader = document.createElement('h3');
            incomingHeader.textContent = 'Gelen Arkadaşlık İstekleri';
            dmContentArea.appendChild(incomingHeader);
            if (incomingResponse.success && Array.isArray(incomingResponse.requests) && incomingResponse.requests.length > 0) {
              const incomingList = document.createElement('ul');
              incomingResponse.requests.forEach(req => {
                const li = document.createElement('li');
                li.className = 'dm-content-item';
                li.textContent = req.from;
                const acceptBtn = document.createElement('button');
                acceptBtn.className = 'friend-accept-btn';
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
                const rejectBtn = document.createElement('button');
                rejectBtn.className = 'friend-reject-btn';
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
                li.appendChild(acceptBtn);
                li.appendChild(rejectBtn);
                incomingList.appendChild(li);
              });
              dmContentArea.appendChild(incomingList);
            } else {
              dmContentArea.appendChild(createDmContentItem('Gelen arkadaşlık isteği bulunmuyor.'));
            }

            const outgoingHeader = document.createElement('h3');
            outgoingHeader.textContent = 'Gönderilen Arkadaşlık İstekleri';
            dmContentArea.appendChild(outgoingHeader);
            if (outgoingResponse.success && Array.isArray(outgoingResponse.requests) && outgoingResponse.requests.length > 0) {
              const outgoingList = document.createElement('ul');
              outgoingResponse.requests.forEach(req => {
                const li = document.createElement('li');
                li.className = 'dm-content-item';
                li.textContent = `To: ${req.to}`;
                outgoingList.appendChild(li);
              });
              dmContentArea.appendChild(outgoingList);
            } else {
              dmContentArea.appendChild(createDmContentItem('Gönderilen arkadaşlık isteği bulunmuyor.'));
            }
          });
        });
      } else if (filter === 'all') {
        socket.emit('getAcceptedFriendRequests', {}, (response) => {
          if (response.success && Array.isArray(response.friends)) {
            if (response.friends.length === 0) {
              dmContentArea.appendChild(createDmContentItem('Hiç arkadaşınız yok.'));
            } else {
              response.friends.forEach(friend => {
                const friendItem = document.createElement('div');
                friendItem.className = 'dm-content-item';
                friendItem.textContent = friend.username;
                friendItem.addEventListener('click', () => {
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
                        msgDiv.className = 'dm-content-item';
                        msgDiv.textContent = `${msg.username}: ${msg.content}`;
                        dmContentArea.appendChild(msgDiv);
                      });
                    } else {
                      dmContentArea.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
                    }
                  });
                });
                dmContentArea.appendChild(friendItem);
              });
            }
          } else {
            dmContentArea.appendChild(createDmContentItem('Arkadaşlar alınırken hata oluştu.'));
          }
        });
      } else if (filter === 'online') {
        socket.emit('getAcceptedFriendRequests', {}, (response) => {
          if (response.success && Array.isArray(response.friends)) {
            if (response.friends.length === 0) {
              dmContentArea.appendChild(createDmContentItem('Hiç arkadaşınız yok.'));
            } else {
              const onlineFriends = response.friends.filter(friend => friend.online);
              if (onlineFriends.length === 0) {
                dmContentArea.appendChild(createDmContentItem('Çevrimiçi hiç arkadaşınız yok.'));
              } else {
                onlineFriends.forEach(friend => {
                  const friendItem = document.createElement('div');
                  friendItem.className = 'dm-content-item';
                  friendItem.textContent = friend.username;
                  friendItem.addEventListener('click', () => {
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
                          msgDiv.className = 'dm-content-item';
                          msgDiv.textContent = `${msg.username}: ${msg.content}`;
                          dmContentArea.appendChild(msgDiv);
                        });
                      } else {
                        dmContentArea.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
                      }
                    });
                  });
                  dmContentArea.appendChild(friendItem);
                });
              }
            }
          } else {
            dmContentArea.appendChild(createDmContentItem('Arkadaşlar alınırken hata oluştu.'));
          }
        });
      } else if (filter === 'blocked') {
        socket.emit('getBlockedFriends', {}, (response) => {
          if (response.success && Array.isArray(response.friends)) {
            if (response.friends.length === 0) {
              dmContentArea.appendChild(createDmContentItem('Engellenen arkadaş bulunmuyor.'));
            } else {
              response.friends.forEach(friend => {
                const friendItem = document.createElement('div');
                friendItem.className = 'dm-content-item';
                friendItem.textContent = friend.username;
                friendItem.addEventListener('click', () => {
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
                        msgDiv.className = 'dm-content-item';
                        msgDiv.textContent = `${msg.username}: ${msg.content}`;
                        dmContentArea.appendChild(msgDiv);
                      });
                    } else {
                      dmContentArea.innerHTML = 'DM mesajları yüklenirken hata oluştu.';
                    }
                  });
                });
                dmContentArea.appendChild(friendItem);
              });
            }
          } else {
            dmContentArea.appendChild(createDmContentItem('Engellenen arkadaşlar alınırken hata oluştu.'));
          }
        });
      }
    });
  }
}
