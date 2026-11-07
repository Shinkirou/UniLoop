// 將地區與學校的原生建議清單改為可鍵盤操作的自訂清單。
function enhance(input) {
  if (input.dataset.suggestReady) return;
  const source = document.getElementById(input.getAttribute('list'));
  if (!source) return;
  input.dataset.suggestReady = 'true';
  input.removeAttribute('list');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const wrap = document.createElement('div');
  wrap.className = 'suggest-field';
  input.before(wrap); wrap.append(input);
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'suggest-toggle';
  toggle.setAttribute('aria-label', '顯示選項');
  toggle.setAttribute('tabindex', '-1');
  toggle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg>';
  const list = document.createElement('div');
  list.className = 'suggest-list'; list.hidden = true;
  list.id = source.id + '-popup'; list.setAttribute('role', 'listbox');
  input.setAttribute('aria-controls', list.id);
  wrap.append(toggle, list);
  let active = -1, showAll = false;
  const norm = s => s.trim().replaceAll('台','臺').toLocaleLowerCase();
  function close() { list.hidden = true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); active = -1; }
  function options() {
    const query = showAll ? '' : norm(input.value);
    return [...source.options].map(option => option.value).filter(value => !query || norm(value).includes(query));
  }
  function paint() {
    if (input.disabled) { close(); return; }
    const values = options();
    list.replaceChildren();
    if (!values.length) {
      const empty = document.createElement('div'); empty.className = 'suggest-empty';
      empty.textContent = '沒有符合的選項'; list.append(empty);
    }
    values.forEach((value, i) => {
      const item = document.createElement('button'); item.type = 'button';
      item.className = 'suggest-option'; item.id = list.id + '-' + i;
      item.setAttribute('role','option'); item.setAttribute('aria-selected', String(i === active));
      item.textContent = value;
      item.addEventListener('pointerdown', event => event.preventDefault());
      item.addEventListener('click', () => choose(value));
      list.append(item);
    });
    list.hidden = false; input.setAttribute('aria-expanded','true');
    if (active >= 0 && active < values.length) {
      input.setAttribute('aria-activedescendant', list.id + '-' + active);
      list.children[active].scrollIntoView({block:'nearest'});
    } else input.removeAttribute('aria-activedescendant');
  }
  function choose(value) {
    input.value = value; input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true})); close(); input.focus();
    close();
  }
  input.addEventListener('focus', () => { showAll = true; active = -1; paint(); });
  input.addEventListener('input', () => { showAll = false; active = -1; paint(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!list.hidden) { event.preventDefault(); event.stopPropagation(); close(); } return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (list.hidden) { showAll = true; active = -1; }
      const count = options().length;
      if (count) active = event.key === 'ArrowDown' ? (active + 1) % count : (active <= 0 ? count - 1 : active - 1);
      paint();
    } else if (event.key === 'Enter' && !list.hidden && active >= 0) { event.preventDefault(); choose(options()[active]); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) close(); }, 100));
  toggle.addEventListener('pointerdown', event => event.preventDefault());
  toggle.addEventListener('click', () => { if (input.disabled) return; if (!list.hidden) close(); else { input.focus(); showAll = true; active = -1; paint(); } });
}
function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.('input[list]')) enhance(root);
  root.querySelectorAll?.('input[list]').forEach(enhance);
}
scan(document.body);
new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) scan(node); }).observe(document.body, {childList:true,subtree:true});
