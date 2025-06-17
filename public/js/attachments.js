let files = [];

export function initAttachments() {
  const attachBtn = document.getElementById('attachBtn');
  const preview = document.getElementById('attachmentPreview');
  const textContainer = document.getElementById('textChannelContainer');
  const inputs = {
    file: document.getElementById('attachFileInput'),
    media: document.getElementById('attachMediaInput'),
    audio: document.getElementById('attachAudioInput'),
    gif: document.getElementById('attachGifInput')
  };
  if (!attachBtn || !preview) return;


  let menu = null;
  let previewDocHandler = null;

  function renderPreview() {
    preview.innerHTML = '';
    files.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-item';
      let el;
      wrapper.tabIndex = 0;
      if (item.file.type.startsWith('image/')) {
        el = document.createElement('img');
        el.src = URL.createObjectURL(item.file);
      } else if (item.file.type.startsWith('video/')) {
        el = document.createElement('span');
        el.className = 'material-icons';
        el.textContent = 'movie';
      } else if (item.file.type.startsWith('audio/')) {
        el = document.createElement('span');
        el.className = 'material-icons';
        el.textContent = 'audiotrack';
      } else {
        el = document.createElement('span');
        el.className = 'material-icons';
        el.textContent = 'insert_drive_file';
      }
      wrapper.appendChild(el);
      const rem = document.createElement('span');
      rem.className = 'remove-badge material-icons';
      rem.textContent = 'close';
      rem.addEventListener('click', () => {
        files.splice(idx, 1);
        renderPreview();
      });
      wrapper.appendChild(rem);
      preview.appendChild(wrapper);
    });
    preview.style.display = files.length ? 'flex' : 'none';
    if (files.length && !previewDocHandler) {
      previewDocHandler = function(e) {
        if (!preview.contains(e.target) && e.target !== attachBtn) {
          clearAttachments();
          document.removeEventListener('click', previewDocHandler);
          previewDocHandler = null;
        }
      };
      document.addEventListener('click', previewDocHandler);
    } else if (!files.length && previewDocHandler) {
      document.removeEventListener('click', previewDocHandler);
      previewDocHandler = null;
    }
  }

  function closeMenu() {
    if (menu) {
      menu.remove();
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
      menu = null;
    }
  }

  function onDocClick(e) {
    if (menu && !menu.contains(e.target) && e.target !== attachBtn) {
      closeMenu();
    }
  }

  function onEsc(e) { if (e.key === 'Escape') closeMenu(); }

  function openMenu() {
    if (menu) { closeMenu(); return; }
    menu = document.createElement('div');
    menu.id = 'attachmentMenu';
    menu.className = 'context-menu';
    ['file', 'media', 'audio', 'gif'].forEach(type => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = type;
      item.addEventListener('click', () => {
        inputs[type].click();
        closeMenu();
      });
      menu.appendChild(item);
    });
    const rect = attachBtn.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    menu.style.display = 'flex';
    document.body.appendChild(menu);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
  }

  attachBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu();
  });

  Object.keys(inputs).forEach(type => {
    const input = inputs[type];
    input.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(f => files.push({ file: f, type }));
      input.value = '';
      renderPreview();
    });
  });

  if (textContainer) {
    const prevent = e => e.preventDefault();
    textContainer.addEventListener('dragenter', prevent);
    textContainer.addEventListener('dragover', prevent);
    textContainer.addEventListener('drop', e => {
      e.preventDefault();
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        Array.from(dt.files).forEach(f => files.push({ file: f, type: 'file' }));
        renderPreview();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    const items = Array.from(preview.querySelectorAll('.preview-item'));
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (!items.length) return;
      e.preventDefault();
      let idx = items.indexOf(document.activeElement);
      if (idx === -1) idx = 0;
      idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      items[idx].focus();
    } else if (e.key === 'Delete') {
      const idx = items.indexOf(document.activeElement);
      if (idx !== -1) {
        files.splice(idx, 1);
        renderPreview();
        const next = items[idx] || items[idx - 1];
        if (next) next.focus();
      }
    } else if (e.key === 'Escape') {
      closeMenu();
      if (files.length) {
        clearAttachments();
      }
    }
  });
}

export function getAttachments() {
  return files.slice();
}

export function clearAttachments() {
  files = [];
  const preview = document.getElementById('attachmentPreview');
  if (preview) preview.innerHTML = '';
  if (preview) preview.style.display = 'none';
  if (previewDocHandler) {
    document.removeEventListener('click', previewDocHandler);
    previewDocHandler = null;
  }
}