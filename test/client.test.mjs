import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { VoxNova, verifyWebhook } from '../dist/index.js';

const seen = [];
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url.startsWith('/api/v1/sms') ? { id: 'm1', status: 'queued' } : { ok: true }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('clé entreprise : SMS, webhooks, scénarios', async () => {
  const vx = new VoxNova({ apiKey: 'vxk_abc', baseUrl: base });
  await vx.sms.send({ to: '0764480084', text: 'Bonjour', sender: 'hCloud', tag: 'accountValidation', type: 'transactional' });
  let r = seen.at(-1);
  assert.equal(r.method, 'POST'); assert.equal(r.url, '/api/v1/sms'); assert.equal(r.body.tag, 'accountValidation');
  assert.equal(r.headers.authorization, 'Bearer vxk_abc');
  assert.equal(r.headers['x-organization'], undefined);
  await vx.sms.list({ status: 'delivered', page: 2 });
  assert.equal(seen.at(-1).url, '/api/v1/sms?status=delivered&page=2');
  await vx.sms.get('3162753901093101');
  assert.equal(seen.at(-1).url, '/api/v1/sms/3162753901093101');
  await vx.sms.balance();
  assert.equal(seen.at(-1).url, '/api/v1/sms/balance');
  await vx.webhooks.create({ url: 'https://exemple.fr/h', events: ['sms.status'] });
  assert.deepEqual(seen.at(-1).body.events, ['sms.status']);
  await vx.flows.update('f1', { name: 'Accueil', graph: { nodes: [], edges: [] } });
  assert.equal(seen.at(-1).method, 'PUT'); assert.equal(seen.at(-1).url, '/api/centrex/flows/f1');
});

test('clé revendeur : X-Organization, clients, packs, panneau', async () => {
  const vx = new VoxNova({ apiKey: 'vxr_abc', baseUrl: base });
  const client = vx.forOrganization('org_1');
  await client.extensions.create({ number: '1001', displayName: 'Accueil' });
  let r = seen.at(-1);
  assert.equal(r.url, '/api/org/extensions'); assert.equal(r.headers['x-organization'], 'org_1');
  await client.users.update('u1', { name: 'Nouveau' });
  assert.equal(seen.at(-1).method, 'PATCH');
  await client.panel.get('/api/centrex/queues', { x: 1 });
  assert.equal(seen.at(-1).url, '/api/centrex/queues?x=1');
  await vx.reseller.clients.applySmsPack('org_1', 'pack_1');
  r = seen.at(-1);
  assert.equal(r.url, '/api/reseller/clients/org_1/sms/pack'); assert.deepEqual(r.body, { packId: 'pack_1' }); assert.equal(r.headers['x-organization'], undefined);
  await vx.reseller.smsPacks.create({ name: 'Pack 100', kind: 'LIFETIME', credits: 100 });
  assert.equal(seen.at(-1).url, '/api/reseller/sms/packs');
});

test('clé invalide refusée ; signature de webhook', () => {
  assert.throws(() => new VoxNova({ apiKey: 'abc', baseUrl: base }), /vxk_/);
  const body = JSON.stringify({ event: 'sms.status', data: { status: 'delivered' } });
  const sig = `sha256=${createHmac('sha256', 'whsec').update(body).digest('hex')}`;
  assert.equal(verifyWebhook('whsec', body, sig), true);
  assert.equal(verifyWebhook('autre', body, sig), false);
  assert.equal(verifyWebhook('whsec', body + ' ', sig), false);
  assert.equal(verifyWebhook('whsec', body, null), false);
  assert.equal(verifyWebhook('whsec', body, 'sha256=zz'), false);
});
