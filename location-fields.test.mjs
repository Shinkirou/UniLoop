import assert from 'node:assert/strict';
import {locationMarkup, setupLocation} from './dist/location-fields.js';
let nodes={};
function mock(id,value=''){return nodes[id]={value,disabled:false,placeholder:'',innerHTML:'',error:'', handlers:{},setCustomValidity(v){this.error=v},addEventListener(k,fn){this.handlers[k]=fn}}}
globalThis.document={getElementById:id=>nodes[id]};
let markup=locationMarkup('pc','','',true);
assert.match(markup,/宜蘭縣/);
assert.doesNotMatch(markup,/宜蘭縣宜蘭市/);
assert.match(markup,/required-star/);
let city=mock('pc-city'),school=mock('pc-school'),list=mock('pc-schools');
setupLocation('pc');assert.equal(school.disabled,true);
city.value='宜蘭縣';city.handlers.input();assert.equal(school.disabled,false);assert.match(list.innerHTML,/佛光大學/);
school.value='佛光大學';city.value='臺北市';city.handlers.input();assert.equal(school.value,'');assert.match(list.innerHTML,/國立臺灣大學/);
city.value='虛構地區';city.handlers.input();assert.equal(school.disabled,true);assert.ok(city.error);
nodes={};city=mock('pc-city','舊資料的地區');school=mock('pc-school','舊資料的學校');list=mock('pc-schools');setupLocation('pc');assert.equal(school.value,'舊資料的學校');assert.equal(school.disabled,false);assert.match(list.innerHTML,/舊資料的學校/);
console.log('地區與學校測試通過：先選地區、篩選學校、保留舊資料。');
