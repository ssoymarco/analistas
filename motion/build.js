// Builds motion/analistas-motion.html from src/template.html, inlining logo.svg as native vector subpaths.
const fs = require('fs'), path = require('path');
const svg = fs.readFileSync(path.join(__dirname, '../motion-assets/logo.svg'), 'utf8');
const d = svg.match(/ d="([^"]+)"/)[1];
const subs = d.split(/(?=M)/).map(s => s.trim());
if (subs.length !== 26) throw new Error('unexpected logo structure: ' + subs.length);
const tpl = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
const out = tpl.replace('%%LOGO_SUBPATHS%%', JSON.stringify(subs));
fs.writeFileSync(path.join(__dirname, 'analistas-motion.html'), out);
console.log('built analistas-motion.html', out.length, 'bytes');
