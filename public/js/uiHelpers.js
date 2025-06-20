export function toggleInputIcons(inputEl, micEl, sendEl) {
  if (!inputEl || !sendEl) return;
  if (inputEl.value.trim() !== '') {
    sendEl.style.display = 'block';
    if (micEl) micEl.style.display = 'none';
  } else {
    sendEl.style.display = 'none';
    if (micEl) micEl.style.display = 'block';
  }
}