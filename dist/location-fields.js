import { schoolMap } from './schools-data.js';
import { regions } from './regions-data.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const normalize = v => v.trim().replaceAll('台','臺');
const entries = regions.map(({city}) => city).filter(city => /[縣市]$/.test(city));
export function locationMarkup(prefix, city = '', school = '', required = false) {
  const star = required ? ' <span class="required-star" aria-label="必填">*</span>' : '';
  return `<label for="${prefix}-city">地區${star}</label><input id="${prefix}-city" list="${prefix}-cities" maxlength="60" value="${esc(city)}" placeholder="輸入或選擇地區" autocomplete="off" ${required?'required':''}><datalist id="${prefix}-cities">${entries.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist><label for="${prefix}-school">學校${star}</label><input id="${prefix}-school" list="${prefix}-schools" maxlength="100" value="${esc(school)}" placeholder="請先選擇地區" autocomplete="off" ${required?'required':''}><datalist id="${prefix}-schools"></datalist>`;
}
export function setupLocation(prefix) {
  const city = document.getElementById(prefix+'-city'), school = document.getElementById(prefix+'-school'), list = document.getElementById(prefix+'-schools');
  const legacyCity = normalize(city.value), initialSchool = school.value;
  let previous = legacyCity;
  const update = () => {
    const current = normalize(city.value);
    const valid = entries.some(x=>normalize(x)===current) || Boolean(current && current===legacyCity);
    city.setCustomValidity(current && !valid ? '請從清單中選擇地區。' : '');
    if (valid && previous && current !== previous) school.value = '';
    if (valid) previous = current;
    school.disabled = !valid;
    school.placeholder = valid ? '輸入或選擇學校' : '請先選擇地區';
    const county = regions.find(x => current.startsWith(normalize(x.city)))?.city || current;
    const choices = [...new Set([...(schoolMap[county] || []), ...(current === legacyCity && initialSchool ? [initialSchool] : [])])];
    list.innerHTML = choices.map(x => `<option value="${esc(x)}"></option>`).join('');
  };
  city.addEventListener('input', () => { if (!city.value.trim()) school.value = ''; update(); });
  city.addEventListener('change', update);
  update();
}
