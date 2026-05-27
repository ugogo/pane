// Run an expression against an arbitrary CDP page identified by a URL substring.
// Usage: node .claude/cdp-target.mjs <url-substring> '<JS expression>'
const HARD_TIMEOUT_MS = 6000;
const [match, ...exprParts] = process.argv.slice(2);
const expr = exprParts.join(' ');
if (!match || !expr) {
  console.error('Usage: node cdp-target.mjs <url-substring> <expr>');
  process.exit(2);
}
const killer = setTimeout(() => { console.error('TIMEOUT'); process.exit(4); }, HARD_TIMEOUT_MS);

try {
  const list = await fetch('http://localhost:9222/json', { signal: AbortSignal.timeout(2000) }).then(r => r.json());
  const page = list.find(p => p.type === 'page' && p.url.includes(match));
  if (!page) { console.error('No matching page. Available:', list.map(p => p.url)); process.exit(1); }
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
  process.exit(3);
}
