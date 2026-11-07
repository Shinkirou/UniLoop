const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('dist/index.html', 'utf8');
const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!matches.length) throw Error('No inline scripts found');
for (const match of matches) new vm.Script(match[1]);
console.log('原網站程式語法檢查通過');
