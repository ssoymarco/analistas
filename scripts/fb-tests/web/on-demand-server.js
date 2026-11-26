// Stands in for the callables (fbOnDemand, fbEstadio): runs the real handlers in-process.
// fbEstadio talks to FCM for topic membership and confirmations — replaced here by no-ops.
const http = require('http');
const server = require('../../../functions/lib/football/on-demand.js');
const { admin } = require('../../../functions/lib/admin-init.js');
const estadio = require('../../../functions/lib/football/estadio.js');
const okFor = tokens => ({ successCount: tokens.length, failureCount: 0, errors: [], responses: [] });
Object.defineProperty(admin, 'messaging', { configurable: true, value: () => ({
  subscribeToTopic: async tokens => okFor(tokens),
  unsubscribeFromTopic: async tokens => okFor(tokens),
  sendEachForMulticast: async m => okFor(m.tokens),
  send: async () => 'harness',
}) });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const t0 = Date.now();
  let data;
  try {
    data = JSON.parse(body || '{}').data;
    const out = /\/fbEstadio$/.test(req.url || '')
      ? await estadio.handleEstadio(data, null)
      : server.toPlain(await server.handleOnDemand(data));
    console.log('ok ', JSON.stringify(data), Date.now() - t0, 'ms');
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result: out }));
  } catch (e) {
    console.log('ERR', JSON.stringify(data), e.code, e.message);
    const status = String(e.code || 'internal').toUpperCase().replace(/-/g, '_');
    res.writeHead((e.httpErrorCode && e.httpErrorCode.status) || 500, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { status, message: e.message } }));
  }
}).listen(5055, '127.0.0.1', () => console.log('shim on 5055'));
