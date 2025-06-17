let files = [];

export function initAttachments() {
  const attachBtn = document.getElementById('attachBtn');
  const preview = document.getElementById('attachmentPreview');
  const inputs = {
    file: document.getElementById('attachFileInput'),
    media: document.getElementById('attachMediaInput'),
    audio: document.getElementById('attachAudioInput'),
    gif: document.getElementById('attachGifInput')
  };
  if (!attachBtn) return;


  function renderPreview() {
    preview.innerHTML = '';
    files.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-item';
      let el;
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
  }

  function openMenu() {
    const existing = document.getElementById('attachmentMenu');
    if (existing) {
      existing.remove();
      return;
    }
    const menu = document.createElement('div');
    menu.id = 'attachmentMenu';
    menu.className = 'context-menu';
    ['file', 'media', 'audio', 'gif'].forEach(type => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = type;
      item.addEventListener('click', () => {
        inputs[type].click();
        menu.remove();
      });
      menu.appendChild(item);
    });
    const rect = attachBtn.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    menu.style.display = 'flex';
    document.body.appendChild(menu);
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target) && e.target !== attachBtn) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    });
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
}

export function getAttachments() {
  return files.slice();
}

export function clearAttachments() {
  files = [];
  const preview = document.getElementById('attachmentPreview');
  if (preview) preview.innerHTML = '';
  if (preview) preview.style.display = 'none';
}