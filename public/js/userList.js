import { showProfilePopout } from './profilePopout.js';

export function createUserItem(username, isOnline) {
  const userItem = document.createElement('div');
  userItem.classList.add('user-item');
  const avatar = document.createElement('img');
  avatar.classList.add('user-profile-pic');
  avatar.dataset.username = username;
  avatar.src = '/images/default-avatar.png';
  window.loadAvatar(username).then(av => { avatar.src = av; });
  avatar.alt = '';
  const userNameSpan = document.createElement('span');
  userNameSpan.classList.add('user-name');
  userNameSpan.textContent = username;
  userItem.appendChild(avatar);
  userItem.appendChild(userNameSpan);
  function handler(e) {
    e.stopPropagation();
    showProfilePopout(username, e);
  }
  avatar.addEventListener('click', handler);
  userNameSpan.addEventListener('click', handler);
  return userItem;
}

export function initAvatarUpdates(socket) {
  socket.on('avatarUpdated', ({ username, avatar }) => {
    window.userAvatars[username] = avatar;
    document.querySelectorAll(`[data-username="${username}"]`).forEach(img => {
      img.src = avatar || '/images/default-avatar.png';
    });
  });
}

export function updateUserList(data) {
  const userListDiv = document.getElementById('userList');
  if (!userListDiv) return;
  userListDiv.innerHTML = '';
  const onlineTitle = document.createElement('div');
  onlineTitle.textContent = 'Çevrimiçi';
  onlineTitle.style.fontWeight = 'normal';
  onlineTitle.style.fontSize = '0.85rem';
  userListDiv.appendChild(onlineTitle);
  if (data.online && data.online.length > 0) {
    data.online.forEach(u => {
      userListDiv.appendChild(createUserItem(u.username, true));
    });
  } else {
    const noneP = document.createElement('p');
    noneP.textContent = '(Kimse yok)';
    noneP.style.fontSize = '0.75rem';
    userListDiv.appendChild(noneP);
  }
  const offlineTitle = document.createElement('div');
  offlineTitle.textContent = 'Çevrimdışı';
  offlineTitle.style.fontWeight = 'normal';
  offlineTitle.style.fontSize = '0.85rem';
  offlineTitle.style.marginTop = '1rem';
  userListDiv.appendChild(offlineTitle);
  if (data.offline && data.offline.length > 0) {
    data.offline.forEach(u => {
      userListDiv.appendChild(createUserItem(u.username, false));
    });
  } else {
    const noneP2 = document.createElement('p');
    noneP2.textContent = '(Kimse yok)';
    noneP2.style.fontSize = '0.75rem';
    userListDiv.appendChild(noneP2);
  }
}
