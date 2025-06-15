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
  const logoutItem = modal.querySelector('.settings-menu li[data-section="logout"]');
  const logoutModal = document.getElementById('logoutConfirmModal');
  const confirmBtn = document.getElementById('confirmLogoutBtn');
  const cancelBtn = document.getElementById('cancelLogoutBtn');

  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      if (item === logoutItem) {
        if (logoutModal) logoutModal.style.display = 'flex';
        return;
      }
      menuItems.forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      loadSection(item.textContent.trim());
    });
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (logoutModal) logoutModal.style.display = 'none';
      closeUserSettings();
      try {
        localStorage.removeItem('username');
      } catch (e) {}
      window.location.reload();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (logoutModal) logoutModal.style.display = 'none';
    });
  }
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