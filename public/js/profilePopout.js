export let currentPopout = null;
let currentUsername = null;
let socketRef = null;

export function initProfilePopout(socket) {
  socketRef = socket;
  socket.on('avatarUpdated', ({ username, avatar }) => {
    if (currentPopout && currentUsername === username) {
      const img = currentPopout.querySelector('.popout-avatar');
      if (img) img.src = avatar || '/images/default-avatar.png';
    }
  });
}

export async function showProfilePopout(username, event) {
  if (currentPopout) {
    currentPopout.remove();
    currentPopout = null;
    currentUsername = null;
  }
  currentUsername = username;
  const resp = await fetch(`/api/user/me?username=${encodeURIComponent(username)}`);
  if (!resp.ok) return;
  const data = await resp.json();
  const pop = document.createElement('div');
  pop.className = 'profile-popout';

  const banner = document.createElement('div');
  banner.className = 'popout-banner';
  pop.appendChild(banner);

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'popout-avatar-wrap';
  const avatar = document.createElement('img');
  avatar.className = 'popout-avatar';
  avatar.src = '/images/default-avatar.png';
  window.loadAvatar(username).then(av => { avatar.src = av; });
  avatar.alt = '';
  avatarWrap.appendChild(avatar);
  const status = document.createElement('span');
  status.className = 'status-dot';
  avatarWrap.appendChild(status);
  pop.appendChild(avatarWrap);

  const nameDiv = document.createElement('div');
  nameDiv.className = 'popout-display-name';
  nameDiv.textContent = data.displayName || username;
  pop.appendChild(nameDiv);

  if (data.badges && Array.isArray(data.badges) && data.badges.length) {
    const row = document.createElement('div');
    row.className = 'popout-badges';
    data.badges.forEach(b => {
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = b;
      row.appendChild(span);
    });
    pop.appendChild(row);
  }

  if (data.ctaLabel) {
    const btn = document.createElement('button');
    btn.className = 'profile-cta-btn';
    btn.textContent = data.ctaLabel;
    pop.appendChild(btn);
  }

  document.body.appendChild(pop);
  positionPopout(pop, event.clientX, event.clientY);

  function onDocClick(e) {
    if (!pop.contains(e.target)) close();
  }
  function onEsc(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (pop.parentNode) pop.parentNode.removeChild(pop);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEsc);
    currentPopout = null;
    currentUsername = null;
  }
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onEsc);
  currentPopout = pop;
}

function positionPopout(pop, x, y) {
  const width = pop.offsetWidth || 300;
  const height = pop.offsetHeight || 200;
  let left = x;
  let top = y;
  const pad = 10;
  if (left + width > window.innerWidth - pad) {
    left = window.innerWidth - width - pad;
  }
  if (top + height > window.innerHeight - pad) {
    top = window.innerHeight - height - pad;
  }
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
