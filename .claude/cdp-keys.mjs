// Drives Input.dispatchKeyEvent against the main page to simulate a real
// keyboard chord into the focused shortcut input.
// Usage: node .claude/cdp-keys.mjs <inputIndex>
const idx = Number(process.argv[2] || 0);
const killer = setTimeout(() => { console.error('TIMEOUT'); process.exit(4); }, 6000);

const list = await fetch('http://localhost:9222/json').then(r => r.json());
const page = list.find(p => p.type === 'page' && p.url.endsWith('localhost:1420/'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
function send(method, params = {}) {
  id += 1; const reqId = id;
  return new Promise(resolve => { pending.set(reqId, resolve); ws.send(JSON.stringify({ id: reqId, method, params })); });
}
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');

// 1) Focus the Nth role=textbox
const focusRes = await send('Runtime.evaluate', {
  expression: `(() => { const els = document.querySelectorAll('[role="textbox"]'); els[${idx}].focus(); return { activeIsTarget: document.activeElement === els[${idx}], placeholder: els[${idx}].textContent }; })()`,
  returnByValue: true,
});
console.log('focus:', JSON.stringify(focusRes.result.result.value));

// 2) Dispatch a real chord: Ctrl Shift down → 1 down → 1 up → Shift up → Ctrl up
const CTRL = 2, SHIFT = 8;
async function key(type, opts) {
  return send('Input.dispatchKeyEvent', { type, ...opts });
}
await key('rawKeyDown', { modifiers: CTRL, key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
await key('rawKeyDown', { modifiers: CTRL | SHIFT, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
await key('keyDown', { modifiers: CTRL | SHIFT, key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, text: '!' });
await key('keyUp', { modifiers: CTRL | SHIFT, key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 });
await key('keyUp', { modifiers: CTRL, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
await key('keyUp', { modifiers: 0, key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });

await new Promise(r => setTimeout(r, 800));
// 3) Read the rendered value
const after = await send('Runtime.evaluate', {
  expression: `(() => { const els = document.querySelectorAll('[role="textbox"]'); return { text: els[${idx}].textContent, msg: document.querySelector('p.mt-3')?.textContent }; })()`,
  returnByValue: true,
});
console.log('after:', JSON.stringify(after.result.result.value));

ws.close();
clearTimeout(killer);
process.exit(0);
