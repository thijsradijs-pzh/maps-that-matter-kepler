// js/autocomplete.js

let acTimer = null;

async function fetchSuggestions(q) {
  if (q.length < 2) { closeAutocomplete(); return; }
  clearTimeout(acTimer);
  acTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/suggest-location?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      showAutocomplete(data.docs || []);
    } catch { closeAutocomplete(); }
  }, 200);
}

function showAutocomplete(docs) {
  const ac = document.getElementById('autocomplete');
  if (!docs.length) { closeAutocomplete(); return; }
  acItems   = docs;
  acFocused = -1;
  ac.innerHTML = docs.map((d, i) =>
    `<div class="ac-item" data-i="${i}" onclick="selectAc(${i})">
      <span>${d.weergavenaam || '–'}</span>
      <span class="ac-type">${d.type || ''}</span>
    </div>`
  ).join('');
  ac.classList.add('open');
}

function closeAutocomplete() {
  document.getElementById('autocomplete').classList.remove('open');
  acItems = []; acFocused = -1;
}

function selectAc(i) {
  const item = acItems[i];
  if (!item) return;
  const name = item.weergavenaam || '';
  document.getElementById('question-input').value = name;
  closeAutocomplete();
  document.getElementById('question-input').focus();
}

function moveAcFocus(dir) {
  const items = document.querySelectorAll('.ac-item');
  if (!items.length) return;
  acFocused = Math.max(-1, Math.min(items.length - 1, acFocused + dir));
  items.forEach((el, i) => el.classList.toggle('focused', i === acFocused));
  if (acFocused >= 0 && acItems[acFocused]) {
    document.getElementById('question-input').value = acItems[acFocused].weergavenaam || '';
  }
}
