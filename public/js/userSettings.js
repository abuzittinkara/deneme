let previousOverflow = '';

function loadSection(title) {
  const content = document.querySelector('#userSettingsModal .settings-content');
  if (content) {
    content.innerHTML = `<h2>${title}</h2>`;
  }
}

export function initUserSettings() {
  const modal = document.getElementById('userSettingsModal');
  if (!modal) return;

  const menuItems = modal.querySelectorAll('.settings-menu li');
  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      menuItems.forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      loadSection(item.textContent.trim());
    });
  });
}

export function openUserSettings() {
  const modal = document.getElementById('userSettingsModal');
  if (modal) {
    previousOverflow = document.body.style.overflow;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

export function closeUserSettings() {
  const modal = document.getElementById('userSettingsModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = previousOverflow;
  }
}