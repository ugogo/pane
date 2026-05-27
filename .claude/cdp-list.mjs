// Detailed view of all CDP targets including their actual document URLs.
const list = await fetch('http://localhost:9222/json').then(r => r.json());
for (const page of list) {
  if (page.type !== 'page') continue;
  console.log('---', page.url, page.title, '---');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
  const info = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({ href: location.href, title: document.title, bodyLen: document.body?.innerText?.length || 0 })',
    returnByValue: true,
  });
  console.log(info.result?.value);
  ws.close();
}
process.exit(0);
