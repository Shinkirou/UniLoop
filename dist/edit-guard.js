// 僅在編輯內容有變化時提示，儲存成功後解除保護。
export function createEditGuard(form) {
  const snapshot = () => JSON.stringify([...form.elements].filter(el => !['button','submit','reset'].includes(el.type)).map(el => [el.name || el.id, el.type, el.type === 'file' ? [...el.files].map(file => [file.name, file.size, file.lastModified]) : el.value, Boolean(el.checked)]));
  const baseline = snapshot();
  const guard = {
    busy: false,
    isDirty: () => snapshot() !== baseline,
    tryLeave() { return !this.busy && (!this.isDirty() || window.confirm('目前有尚未儲存的變更，確定要離開嗎？')); },
    clear() { if (window.uniloopEditGuard === guard) window.uniloopEditGuard = null; }
  };
  window.uniloopEditGuard = guard;
  return guard;
}
window.addEventListener('beforeunload', event => {
  const guard = window.uniloopEditGuard;
  if (guard && (guard.busy || guard.isDirty())) { event.preventDefault(); event.returnValue = ''; }
});
