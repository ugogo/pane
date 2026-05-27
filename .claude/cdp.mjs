// Tight CDP driver with hard timeout. Never hangs silently.
// Usage: node .claude/cdp.mjs '<JS expression>'

const HARD_TIMEOUT_MS = 5000;
const expr = process.argv.slice(2).join(' ');
if (!expr) {
  console.error('Usage: node cdp.mjs <expression>');
  process.exit(2);
}

const killer = setTimeout(() => {
  console.error(`TIMEOUT after ${HARD_TIMEOUT_MS}ms — script stuck`);
  process.exit(4);
}, HARD_TIMEOUT_MS);

try {
  const list = await fetch('http://localhost:9222/json', {
    signal: AbortSignal.timeout(2000),
  }).then(r => r.json());

  const targetUrl = process.env.CDP_TARGET_URL || 'localhost:1420';
  // Prefer the main window (no ?view= query) when multiple Tauri windows are open.
  let page = list.find(p => p.type === 'page' && p.url.includes(targetUrl) && !p.url.includes('?view='));
  if (!page) page = list.find(p => p.type === 'page' && p.url.includes(targetUrl));
  if (!page) {
    console.error('No matching page. Available:', JSON.stringify(list.map(p => p.url)));
    process.exit(1);
  }

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
    return new Promise((resolve, reject) => {
      pending.set(reqId, resolve);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  await send('Runtime.enable');
  const result = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 3000,
  });

  const inner = result.result || {};
  if (inner.exceptionDetails) {
    console.error('EXCEPTION:', inner.exceptionDetails.exception?.description || inner.exceptionDetails.text);
    process.exit(1);
  }

  console.log(JSON.stringify(inner.result?.value ?? inner.result, null, 2));
  ws.close();
  clearTimeout(killer);
  process.exit(0);
} catch (e) {
  console.error('ERROR:', e.message);
  clearTimeout(killer);
  process.exit(3);
}
