function loadSection(title) {
  const content = document.querySelector('#userSettingsPage .settings-content');
  if (!content) return;
  if (title === 'Hesabım') {
    content.innerHTML = `
      <h1 class="account-title">Hesabım</h1>
      <div class="account-tabs">
        <button class="account-tab active">Güvenlik</button>
        <button class="account-tab">Durum</button>
      </div>
      <div class="cover-strip"></div>
      <div class="profile-block">
        <div class="profile-avatar"></div>
        <h1 class="display-name">Gösterim Adı</h1>
        <button class="edit-profile-btn">Kullanıcı Profilini Düzenle</button>
      </div>
      <div class="info-card">
        <div class="info-row">
          <div>
            <div class="info-label">Görünen Ad</div>
            <div class="info-value">Kullanıcının Görünen Adı</div>
          </div>
          <button class="edit-btn">Düzenle</button>
        </div>
        <div class="info-row">
          <div>
            <div class="info-label">Kullanıcı adı</div>
            <div class="info-value">Kullanıcının Kullanıcı Adı</div>
          </div>
          <button class="edit-btn">Düzenle</button>
        </div>
        <div class="info-row">
          <div>
            <div class="info-label">E-Posta</div>
            <div class="info-value">**********@gmail.com</div>
          </div>
          <button class="edit-btn">Düzenle</button>
        </div>
        <div class="info-row">
          <div>
            <div class="info-label">Telefon Numarası</div>
            <div class="info-value">+90 5** *** ** **</div>
            <div class="remove-link">Kaldır</div>
          </div>
          <button class="edit-btn">Düzenle</button>
        </div>
      </div>`;
  } else {
    content.innerHTML = `<h2>${title}</h2>`;
  }
}

export function initUserSettings() {
  const modal = document.getElementById('userSettingsPage');
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
  const page = document.getElementById('userSettingsPage');
  const callScreen = document.getElementById('callScreen');
  if (page) {
    page.style.display = 'block';
  }
  if (callScreen) {
    callScreen.style.display = 'none';
  }
}

export function closeUserSettings() {
  const page = document.getElementById('userSettingsPage');
  const callScreen = document.getElementById('callScreen');
  if (page) {
    page.style.display = 'none';
  }
  if (callScreen) {
    callScreen.style.display = 'flex';
  }
}