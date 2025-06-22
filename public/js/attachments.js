export const MAX_FILES = 10;
import { getInputText } from './uiHelpers.js';
let files = [];
let previewDocHandler = null;
let overlayIdx = 0;
let overlay = null;
let captionInput = null;

export function initAttachments() {
  const attachBtn = document.getElementById('attachBtn');
  const preview = document.getElementById('attachmentPreview');
  overlay = document.getElementById('previewWrapper');
  const mainMedia = overlay?.querySelector('.main-media');
  const tray = overlay?.querySelector('.thumbnail-tray');
  captionInput = overlay?.querySelector('.caption-input');
  const closeBtn = overlay?.querySelector('.close-icon');
  const textContainer = document.getElementById('textChannelContainer');
  const inputs = {
    file: document.getElementById('attachFileInput'),
    media: document.getElementById('attachMediaInput'),
    audio: document.getElementById('attachAudioInput'),
    gif: document.getElementById('attachGifInput')
  };
  if (!attachBtn || !preview) return;


  let menu = null;

  function renderPreview() {
    preview.innerHTML = '';
    files.forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-item';
      wrapper.dataset.index = idx;
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
      const progress = document.createElement('div');
      progress.className = 'upload-progress';
      const bar = document.createElement('div');
      bar.className = 'bar';
      progress.appendChild(bar);
      wrapper.appendChild(progress);
      const retry = document.createElement('button');
      retry.className = 'retry-btn';
      retry.textContent = '↻';
      retry.style.display = 'none';
      wrapper.appendChild(retry);
      preview.appendChild(wrapper);
    });
    preview.style.display = files.length ? 'flex' : 'none';
    if (files.length && !previewDocHandler) {
      previewDocHandler = function(e) {
        const inPreview = preview.contains(e.target);
        const inOverlay = overlay && overlay.contains(e.target);
        if (!inPreview && !inOverlay && e.target !== attachBtn) {
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

    if (overlay && overlay.style.display !== 'none') renderOverlay();
  }

  function createFileCard(item, idx) {
    const card = document.createElement('div');
    card.className = 'file-card';
    const nameEl = document.createElement('span');
    nameEl.textContent = item.file.name;
    card.appendChild(nameEl);
    const remove = document.createElement('span');
    remove.className = 'remove-btn';
    remove.textContent = '×';
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      files.splice(idx, 1);
      if (overlayIdx >= idx) overlayIdx = Math.max(overlayIdx - 1, 0);
      renderPreview();
      renderOverlay();
    });
    card.appendChild(remove);
    return card;
  }

  function renderOverlay() {
    if (!overlay) return;
    tray.innerHTML = '';
    files.slice(0, MAX_FILES).forEach((item, idx) => {
      let el;
      if (item.file.type.startsWith('image/')) {
        el = document.createElement('img');
        el.src = URL.createObjectURL(item.file);
      } else if (item.file.type.startsWith('video/')) {
        el = document.createElement('video');
        el.src = URL.createObjectURL(item.file);
        el.muted = true;
      } else {
        el = createFileCard(item, idx);
      }
      el.dataset.index = idx;
      el.addEventListener('click', () => {
        overlayIdx = idx;
        updateMainMedia();
      });
      tray.appendChild(el);
    });
    if (files.length) updateMainMedia();
    else closeOverlay();
  }

  function updateMainMedia() {
    if (!overlay) return;
    mainMedia.innerHTML = '';
    const item = files[overlayIdx];
    if (!item) return;
    let el;
    if (item.file.type.startsWith('image/')) {
      el = document.createElement('img');
      el.src = URL.createObjectURL(item.file);
    } else if (item.file.type.startsWith('video/')) {
      el = document.createElement('video');
      el.controls = true;
      const src = document.createElement('source');
      src.src = URL.createObjectURL(item.file);
      src.type = item.file.type;
      el.appendChild(src);
    } else {
      el = createFileCard(item, overlayIdx);
    }
    mainMedia.appendChild(el);
  }

  function openOverlay() {
    if (!overlay) return;
    const messages = document.getElementById('textMessages');
    overlayIdx = 0;
    renderOverlay();
    overlay.style.display = 'flex';
    if (messages) messages.style.display = 'none';
    if (captionInput) captionInput.focus();
    const sendBtn = document.getElementById('sendTextMessageBtn');
    if (sendBtn) sendBtn.style.display = 'block';
    const micBtn = document.getElementById('micMessageBtn');
    if (micBtn) micBtn.style.display = 'none';
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.style.display = 'none';
    const messages = document.getElementById('textMessages');
    if (messages) messages.style.display = '';
    const input = document.getElementById('textChannelMessageInput');
    const sendBtn = document.getElementById('sendTextMessageBtn');
    const micBtn = document.getElementById('micMessageBtn');
    if (input && sendBtn && micBtn) {
      const val = getInputText(input).trim();
      if (val === '') {
        sendBtn.style.display = 'none';
        micBtn.style.display = 'block';
      } else {
        sendBtn.style.display = 'block';
        micBtn.style.display = 'none';
      }
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
      const incoming = Array.from(e.target.files);
      const remaining = MAX_FILES - files.length;
      incoming.slice(0, remaining).forEach(f => files.push({ file: f, type }));
      if (incoming.length > remaining) {
        alert(`En fazla ${MAX_FILES} dosya ekleyebilirsiniz.`);
      }
      input.value = '';
      renderPreview();
      openOverlay();
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
        const incoming = Array.from(dt.files);
        const remaining = MAX_FILES - files.length;
        incoming.slice(0, remaining).forEach(f => files.push({ file: f, type: 'file' }));
        if (incoming.length > remaining) {
          alert(`En fazla ${MAX_FILES} dosya ekleyebilirsiniz.`);
        }
        renderPreview();
        openOverlay();
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
      if (overlay && overlay.style.display !== 'none') {
        closeOverlay();
      } else {
        closeMenu();
        if (files.length) {
          clearAttachments();
        }
      }
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
}

export function getAttachments() {
  return files.slice();
}

export function clearAttachments() {
  files = [];
  const preview = document.getElementById('attachmentPreview');
  if (preview) preview.innerHTML = '';
  if (preview) preview.style.display = 'none';
  if (overlay) {
    overlay.style.display = 'none';
    if (captionInput) captionInput.value = '';
  }
  const messages = document.getElementById('textMessages');
  if (messages) messages.style.display = '';
  if (previewDocHandler) {
    document.removeEventListener('click', previewDocHandler);
    previewDocHandler = null;
  }
}

export function updateAttachmentProgress(idx, percent) {
  const bar = document.querySelector(
    `#attachmentPreview .preview-item[data-index="${idx}"] .bar`
  );
  if (bar) bar.style.width = `${percent}%`;
}

export function markAttachmentFailed(idx, retryFn) {
  const wrapper = document.querySelector(
    `#attachmentPreview .preview-item[data-index="${idx}"]`
  );
  if (wrapper) {
    wrapper.classList.add('upload-failed');
    const btn = wrapper.querySelector('.retry-btn');
    if (btn) {
      btn.style.display = 'block';
      if (retryFn) btn.onclick = retryFn;
    }
  }
}