let groupUsers = [];
let dropdown = null;
let selectedIndex = -1;
let atPosition = -1;
let activeInput = null;

export function initMentions(socket) {
  socket.on('groupUsers', (data) => {
    const list = [];
    if (data && data.online) list.push(...data.online.map(u => u.username));
    if (data && data.offline) list.push(...data.offline.map(u => u.username));
    groupUsers = list;
  });
}

function getDropdown() {
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'mention-dropdown';
    dropdown.style.display = 'none';
    document.body.appendChild(dropdown);
  }
  return dropdown;
}

function hideDropdown() {
  if (!dropdown) return;
  dropdown.style.display = 'none';
  dropdown.innerHTML = '';
  selectedIndex = -1;
  atPosition = -1;
}

function highlight() {
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.mention-dropdown-item');
  items.forEach((it, idx) => {
    if (idx === selectedIndex) it.classList.add('active');
    else it.classList.remove('active');
  });
}

function insertMention(name) {
  if (!activeInput) return;
  const val = activeInput.value;
  const before = val.slice(0, atPosition);
  const after = val.slice(activeInput.selectionStart);
  const text = `@${name} `;
  activeInput.value = before + text + after;
  const pos = before.length + text.length;
  activeInput.setSelectionRange(pos, pos);
  hideDropdown();
}

export function handleInput(input) {
  activeInput = input;
  const pos = input.selectionStart;
  const val = input.value;
  const at = val.lastIndexOf('@', pos - 1);
  if (at === -1) { hideDropdown(); return; }
  const query = val.slice(at + 1, pos);
  if (/\s/.test(query)) { hideDropdown(); return; }
  const list = groupUsers.filter(u => u.toLowerCase().startsWith(query.toLowerCase()));
  if (!list.length) { hideDropdown(); return; }
  const dd = getDropdown();
  dd.innerHTML = '';
  list.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'mention-dropdown-item';
    item.textContent = u;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertMention(u);
    });
    dd.appendChild(item);
  });
  selectedIndex = 0;
  highlight();
  atPosition = at;
  const rect = input.getBoundingClientRect();
  dd.style.width = rect.width + 'px';
  const bar = document.getElementById('selectedChannelBar');
  const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
  const maxHeight = rect.top - barBottom - 4;
  dd.style.maxHeight = maxHeight + 'px';
  dd.style.left = rect.left + 'px';
  const height = Math.min(dd.scrollHeight, maxHeight);
  dd.style.top = (rect.top - height - 4) + 'px';
  dd.style.display = 'block';
}

export function handleKeydown(e) {
  if (!dropdown || dropdown.style.display === 'none') return false;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const count = dropdown.children.length;
    selectedIndex = Math.min(selectedIndex + 1, count - 1);
    highlight();
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    highlight();
    return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const item = dropdown.children[selectedIndex];
    if (item) insertMention(item.textContent);
    return true;
  }
  if (e.key === 'Escape') {
    hideDropdown();
    return true;
  }
  return false;
}

export { hideDropdown };
