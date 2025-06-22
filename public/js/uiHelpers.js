export function getInputText(el) {
  if (!el) return '';
  const val = el.value !== undefined ? el.value : el.innerText;
  return val.replace(/\u00a0/g, ' ');
}

export function clearInput(el) {
  if (!el) return;
  if (el.value !== undefined) el.value = '';
  else el.innerHTML = '';
}

export function toggleInputIcons(inputEl, micEl, sendEl) {
  if (!inputEl || !sendEl) return;
  if (getInputText(inputEl).trim() !== '') {
    sendEl.style.display = 'block';
    if (micEl) micEl.style.display = 'none';
  } else {
    sendEl.style.display = 'none';
    if (micEl) micEl.style.display = 'block';
  }
}