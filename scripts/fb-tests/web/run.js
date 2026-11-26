// Drive the web build like a phone:  node run.js [--storage state.json] step...
// steps: tap:Text | tapx:ExactText | taplast:Text | ph:Placeholder | click:x,y | type:text | key:Enter |
//        scroll:px | wait:ms | shot:name | text[:n] | vtext[:n] (visible text) | ls:key | dumpls:file | back
const { open } = require('./browser');
const fs = require('fs');
(async () => {
  let args = process.argv.slice(2), storage = {};
  if (args[0] === '--storage') { storage = JSON.parse(fs.readFileSync(args[1], 'utf8')); args = args.slice(2); }
  const a = await open({ storage });
  await a.wait(5000);
  for (const step of args) {
    const i = step.indexOf(':'); const cmd = i < 0 ? step : step.slice(0, i); const arg = i < 0 ? '' : step.slice(i + 1);
    try {
      if (cmd === 'tap') await a.tap(arg);
      else if (cmd === 'tapx') await a.tap(arg, { exact: true });
      else if (cmd === 'taplast') { const l = a.page.getByText(arg, { exact: false }).last(); await l.click(); }
      else if (cmd === 'wait') await a.wait(Number(arg));
      else if (cmd === 'shot') await a.shot(arg);
      else if (cmd === 'text') console.log(`--- text\n${(await a.text()).slice(0, Number(arg) || 1500)}`);
      else if (cmd === 'vtext') console.log('--- visible\n' + (await a.page.evaluate(() => {
        const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) {
          const s = n.textContent.trim(); if (!s) continue;
          const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
          if (!b.width || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
          const el = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2)));
          if (el && (el === n.parentElement || el.contains(n) || n.parentElement.contains(el))) out.push(s);
        }
        return out.join(' | ');
      })).slice(0, Number(arg) || 1500));
      else if (cmd === 'scroll') await a.page.mouse.wheel(0, Number(arg));
      else if (cmd === 'type') await a.page.keyboard.type(arg, { delay: 40 });
      else if (cmd === 'key') await a.page.keyboard.press(arg);
      else if (cmd === 'click') { const [x, y] = arg.split(',').map(Number); await a.page.mouse.click(x, y); }
      else if (cmd === 'ph') await a.page.getByPlaceholder(arg).first().click();
      else if (cmd === 'dumpls') require('fs').writeFileSync(arg, JSON.stringify(await a.page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))));
      else if (cmd === 'back') await a.page.goBack();
      else if (cmd === 'ls') console.log('--- ls', JSON.stringify(await a.page.evaluate(k => localStorage.getItem(k), arg)));
      else console.log('unknown step', step);
    } catch (e) { console.log(`!! step "${step}" failed: ${String(e.message).split('\n')[0]}`); }
  }
  const errs = a.errors.filter(e => !/WebSocket connection/.test(e));
  console.log('--- errors:', errs.length); errs.slice(0, 10).forEach(e => console.log(e));
  await a.browser.close();
})().catch(e => { console.error(e); process.exit(1); });
