// Builds modo-estadio.html from src/template.html + src/audio.js, inlining logo.svg as native vector subpaths.
const fs = require('fs'), path = require('path');
const svg = fs.readFileSync(path.join(__dirname, '../../motion-assets/logo.svg'), 'utf8');
const subs = svg.match(/ d="([^"]+)"/)[1].split(/(?=M)/).map(s => s.trim());
if (subs.length !== 26) throw new Error('unexpected logo structure: ' + subs.length);
const tpl = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
const audio = fs.readFileSync(path.join(__dirname, 'src/audio.js'), 'utf8');
const out = tpl.replace('%%LOGO_SUBPATHS%%', JSON.stringify(subs)).replace('%%AUDIO%%', audio);
fs.writeFileSync(path.join(__dirname, 'modo-estadio.html'), out);
console.log('built modo-estadio.html', out.length, 'bytes');
