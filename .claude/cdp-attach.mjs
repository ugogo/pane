// Attach to the about:blank target and try to find out why it isn't navigating.
const list = await fetch('http://localhost:9222/json').then(r => r.json());
const target = list.find(p => p.type === 'page' && p.url === 'about:blank');
if (!target) {
  console.log('No about:blank target found.');
  process.exit(0);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
function send(method, params = {}) {
  id += 1;
  const reqId = id;
  return new Promise((resolve) => {
    pending.set(reqId, resolve);
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });
}
await new Promise(r => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');
const probe = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({ href: location.href, search: location.search, hash: location.hash, hasTauri: typeof window.__TAURI_INTERNALS__ })',
  returnByValue: true,
});
console.log('probe:', probe.result?.value);
ws.close();
process.exit(0);
