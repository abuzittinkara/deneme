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
        <div class="profile-avatar" id="profile-avatar">
          <img id="avatarImage" src="/images/default-avatar.png" alt="" />
          <div class="avatar-overlay"><span class="material-symbols-outlined">edit</span></div>
        </div>
        <h1 class="display-name" id="displayNameHeading">Gösterim Adı</h1>
        <button class="edit-profile-btn">Kullanıcı Profilini Düzenle</button>
      </div>
      <div class="info-card">
        <div class="info-row" id="displayNameRow" data-label="Görünen Ad" data-field="displayName">
          <div>
            <div class="info-label">Görünen Ad</div>
            <div class="info-value">Kullanıcının Görünen Adı</div>
          </div>
          <button class="edit-btn" id="editDisplayNameBtn">Düzenle</button>
        </div>
        <div class="info-row" id="userHandleRow" data-label="Kullanıcı adı" data-field="username">
          <div>
            <div class="info-label">Kullanıcı adı</div>
            <div class="info-value">Kullanıcının Kullanıcı Adı</div>
          </div>
          <button class="edit-btn" id="editUserHandleBtn">Düzenle</button>
        </div>
        <div class="info-row" id="emailRow" data-label="E-Posta" data-field="email">
          <div>
            <div class="info-label">E-Posta</div>
            <div class="info-value">**********@gmail.com</div>
          </div>
          <button class="edit-btn" id="editEmailBtn">Düzenle</button>
        </div>
        <div class="info-row" id="phoneRow" data-label="Telefon Numarası" data-field="phone">
          <div>
            <div class="info-label">Telefon Numarası</div>
            <div class="info-value">+90 5** *** ** **</div>
          </div>
          <div class="info-actions">
            <div class="remove-link" id="removePhoneLink">Kaldır</div>
            <button class="edit-btn" id="editPhoneBtn">Düzenle</button>
          </div>
        </div>
      </div>`;
    initAccountSection();
  } else {
    content.innerHTML = `<h2>${title}</h2>`;
  }
}

const accountModals = [
  'editUsernameModal',
  'editEmailModal',
  'editPhoneModal',
  'removePhoneConfirmModal',
  'avatarUploadModal',
  'removeAvatarModal'
];

function trapFocus(modal) {
  const selector =
    'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusable = Array.from(modal.querySelectorAll(selector));
  if (!focusable.length) return () => {};
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  function handle(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  modal.addEventListener('keydown', handle);
  setTimeout(() => first.focus(), 0);
  return () => modal.removeEventListener('keydown', handle);
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.style.display = 'flex';
    m.classList.add('active');
    if (accountModals.includes(id)) document.body.classList.add('blurred');
    m._untrap = trapFocus(m);
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.style.display = 'none';
    m.classList.remove('active');
    if (typeof m._untrap === 'function') {
      m._untrap();
      m._untrap = null;
    }
    if (accountModals.includes(id)) {
      const stillOpen = accountModals.some(mid => {
        const el = document.getElementById(mid);
        return el && el.classList.contains('active');
      });
      if (!stillOpen) document.body.classList.remove('blurred');
    }
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 2000);
}


function openEditUsernameModal() {
  const modal = document.getElementById('editUsernameModal');
  if (!modal) return;
  const input = modal.querySelector('input');
  const save = modal.querySelector('.modal-buttons .btn.primary');
  const cancelBtn = modal.querySelector('.modal-buttons .btn.secondary');
  const error = modal.querySelector('.modal-error');
  const closeBtn = modal.querySelector('.close-modal');
  function setError(msg) { if (error) { error.textContent = msg; error.style.display = 'block'; } }
  function clearError() { if (error) { error.textContent = ''; error.style.display = 'none'; } }
  function close() {
    closeModal('editUsernameModal');
    document.removeEventListener('keydown', esc);
    if (input) input.removeEventListener('input', onInput);
  }
  function esc(e) { if (e.key === 'Escape') close(); }
  if (closeBtn) closeBtn.addEventListener('click', close, { once: true });
  if (cancelBtn) cancelBtn.addEventListener('click', close, { once: true });
  document.addEventListener('keydown', esc);
  function onInput() {
    clearError();
    if (save) save.disabled = input.value.trim() === '';
  }
  if (input) {
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && save && !save.disabled) save.click();
    });
  }
  if (save) {
    save.addEventListener('click', async function handler() {
      if (save.disabled) return;
      const v = input.value.trim();
      if (!v) { setError('Bu alan boş bırakılamaz'); return; }
      save.disabled = true;
      const orig = save.innerHTML;
      save.innerHTML = '<span class="spinner"></span>';
      try {
        const uname = localStorage.getItem('username');
        const resp = await fetch(`/api/user/me?username=${encodeURIComponent(uname)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'username', value: v })
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setError(data.error || 'Sunucu hatası');
          return;
        }
        const rowVal = document.querySelector('#userHandleRow .info-value');
        if (rowVal) rowVal.textContent = v;
        try { localStorage.setItem('username', v); } catch (e) {}
        if (typeof showToast === 'function') showToast('Changes saved');
        close();
      } catch (err) {
        setError('Sunucu hatası');
      } finally {
        save.innerHTML = orig;
        save.disabled = false;
        save.removeEventListener('click', handler);
      }
    }, { once: true });
    save.disabled = input.value.trim() === '';
  }
  openModal('editUsernameModal');
}

function openEditEmailModal() {
  const modal = document.getElementById('editEmailModal');
  if (!modal) return;
  const input = modal.querySelector('input');
  const save = modal.querySelector('.modal-buttons .btn.primary');
  const cancelBtn = modal.querySelector('.modal-buttons .btn.secondary');
  const error = modal.querySelector('.modal-error');
  const closeBtn = modal.querySelector('.close-modal');
  function setError(msg) { if (error) { error.textContent = msg; error.style.display = 'block'; } }
  function clearError() { if (error) { error.textContent = ''; error.style.display = 'none'; } }
  function close() {
    closeModal('editEmailModal');
    document.removeEventListener('keydown', esc);
    if (input) input.removeEventListener('input', onInput);
  }
  function esc(e) { if (e.key === 'Escape') close(); }
  if (closeBtn) closeBtn.addEventListener('click', close, { once: true });
  if (cancelBtn) cancelBtn.addEventListener('click', close, { once: true });
  document.addEventListener('keydown', esc);
  function onInput() {
    clearError();
    if (save) save.disabled = input.value.trim() === '';
  }
  if (input) {
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && save && !save.disabled) save.click();
    });
  }
  if (save) {
    save.addEventListener('click', async function handler() {
      if (save.disabled) return;
      const v = input.value.trim();
      if (!v) { setError('Bu alan boş bırakılamaz'); return; }
      save.disabled = true;
      const orig = save.innerHTML;
      save.innerHTML = '<span class="spinner"></span>';
      try {
        const uname = localStorage.getItem('username');
        const resp = await fetch(`/api/user/me?username=${encodeURIComponent(uname)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'email', value: v })
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setError(data.error || 'Sunucu hatası');
          return;
        }
        const rowVal = document.querySelector('#emailRow .info-value');
        if (rowVal) rowVal.textContent = v;
        if (typeof showToast === 'function') showToast('Changes saved');
        close();
      } catch (err) {
        setError('Sunucu hatası');
      } finally {
        save.innerHTML = orig;
        save.disabled = false;
        save.removeEventListener('click', handler);
      }
    }, { once: true });
    save.disabled = input.value.trim() === '';
  }
  openModal('editEmailModal');
}

function openEditPhoneModal() {
  const modal = document.getElementById('editPhoneModal');
  if (!modal) return;
  const input = modal.querySelector('input');
  const save = modal.querySelector('.modal-buttons .btn.primary');
  const cancelBtn = modal.querySelector('.modal-buttons .btn.secondary');
  const error = modal.querySelector('.modal-error');
  const closeBtn = modal.querySelector('.close-modal');
  function setError(msg) { if (error) { error.textContent = msg; error.style.display = 'block'; } }
  function clearError() { if (error) { error.textContent = ''; error.style.display = 'none'; } }
  function close() {
    closeModal('editPhoneModal');
    document.removeEventListener('keydown', esc);
    if (input) input.removeEventListener('input', onInput);
  }
  function esc(e) { if (e.key === 'Escape') close(); }
  if (closeBtn) closeBtn.addEventListener('click', close, { once: true });
  if (cancelBtn) cancelBtn.addEventListener('click', close, { once: true });
  document.addEventListener('keydown', esc);
  function onInput() {
    clearError();
    if (save) save.disabled = input.value.trim() === '';
  }
  if (input) {
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && save && !save.disabled) save.click();
    });
  }
  if (save) {
    save.addEventListener('click', async function handler() {
      if (save.disabled) return;
      const v = input.value.trim();
      if (!v) { setError('Bu alan boş bırakılamaz'); return; }
      save.disabled = true;
      const orig = save.innerHTML;
      save.innerHTML = '<span class="spinner"></span>';
      try {
        const uname = localStorage.getItem('username');
        const resp = await fetch(`/api/user/me?username=${encodeURIComponent(uname)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'phone', value: v })
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setError(data.error || 'Sunucu hatası');
          return;
        }
        const rowVal = document.querySelector('#phoneRow .info-value');
        if (rowVal) rowVal.textContent = v;
        if (typeof showToast === 'function') showToast('Changes saved');
        close();
      } catch (err) {
        setError('Sunucu hatası');
      } finally {
        save.innerHTML = orig;
        save.disabled = false;
        save.removeEventListener('click', handler);
      }
    }, { once: true });
    save.disabled = input.value.trim() === '';
  }
  openModal('editPhoneModal');
}

let avatarCropper = null;

function initAccountSection() {
  const uname = (() => { try { return localStorage.getItem('username'); } catch (e) { return null; } })();
  if (uname) {
    fetch(`/api/user/me?username=${encodeURIComponent(uname)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const hd = document.getElementById('displayNameHeading');
        if (hd) hd.textContent = data.displayName || '';
        const setVal = (id, val) => {
          const el = document.querySelector(`#${id} .info-value`);
          if (el) el.textContent = val || '—';
        };
        setVal('displayNameRow', data.displayName);
        setVal('userHandleRow', data.username);
        setVal('emailRow', data.email);
        setVal('phoneRow', data.phone);
      })
      .catch(() => {});
  }
 // editing handled via separate modals now
  const editEmailBtn = document.getElementById('editEmailBtn');
  const editPhoneBtn = document.getElementById('editPhoneBtn');
  const editUsernameBtn = document.getElementById('editUserHandleBtn');
  const removePhoneLink = document.getElementById('removePhoneLink');
  const avatar = document.getElementById('profile-avatar');

  if (editUsernameBtn) editUsernameBtn.addEventListener('click', openEditUsernameModal);
  if (editEmailBtn) editEmailBtn.addEventListener('click', openEditEmailModal);
  if (editPhoneBtn) editPhoneBtn.addEventListener('click', openEditPhoneModal);
  if (removePhoneLink) removePhoneLink.addEventListener('click', () => openModal('removePhoneConfirmModal'));
  if (avatar) avatar.addEventListener('click', () => openModal('avatarUploadModal'));

  const closeAvatar = document.getElementById('closeAvatarUploadModal');
  const avatarInput = document.getElementById('avatarFileInput');
  const saveAvatarBtn = document.getElementById('saveAvatarBtn');
  const cropContainer = document.getElementById('avatarCropContainer');

  if (closeAvatar) closeAvatar.addEventListener('click', () => {
    if (avatarCropper) { avatarCropper.destroy(); avatarCropper = null; }
    closeModal('avatarUploadModal');
  });

  if (avatarInput) {
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('Dosya 2 MB\'dan büyük');
        avatarInput.value = '';
        return;
      }
      const url = URL.createObjectURL(file);
      cropContainer.innerHTML = `<img id="avatarCropImage" src="${url}" />`;
      const img = document.getElementById('avatarCropImage');
      if (avatarCropper) avatarCropper.destroy();
      avatarCropper = new Cropper(img, { aspectRatio: 1 });
    });
  }

  if (saveAvatarBtn) {
    saveAvatarBtn.addEventListener('click', () => {
      if (!avatarCropper) return;
      const canvas = avatarCropper.getCroppedCanvas({ width: 256, height: 256 });
      const dataUrl = canvas.toDataURL('image/png');
      const img = document.getElementById('avatarImage');
      if (img) img.src = dataUrl;
      // TODO: upload avatar to server
      avatarCropper.destroy();
      avatarCropper = null;
      closeModal('avatarUploadModal');
    });
  }

  const cancelRemovePhone = document.getElementById('cancelRemovePhoneBtn');
  const confirmRemovePhone = document.getElementById('confirmRemovePhoneBtn');
  const closeRemovePhone = document.getElementById('closeRemovePhoneConfirmModal');
  if (closeRemovePhone) closeRemovePhone.addEventListener('click', () => closeModal('removePhoneConfirmModal'));
  if (cancelRemovePhone) cancelRemovePhone.addEventListener('click', () => closeModal('removePhoneConfirmModal'));
  if (confirmRemovePhone) confirmRemovePhone.addEventListener('click', () => {
    const phoneVal = document.querySelector('#phoneRow .info-value');
    if (phoneVal) phoneVal.textContent = '—';
    // TODO: remove phone on server
    closeModal('removePhoneConfirmModal');
  });
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