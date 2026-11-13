# @voxnova/sdk

SDK TypeScript de la plateforme développeurs VoxNova (Node 18+, sans dépendance).

- `VoxNova` : client de l'API REST (clé d'entreprise `vxk_…` ou clé revendeur `vxr_…`) : **SMS** (envoi, suivi de remise, crédits), webhooks, applications, endpoints SIP, numéros, appels, enregistrements, journal, **scénarios d'appel** (`flows`), utilisateurs, postes, files d'attente, groupes d'appel, serveurs vocaux, accès brut au panneau (`panel`) et **espace revendeur** (`reseller.*`, `forOrganization()`).
- `VoiceResponse` : construction des instructions renvoyées par votre webhook (dial plan en code).
- `verifySignature` : vérification des rappels des applications vocales (`t=…,v1=…`).
- `verifyWebhook` : vérification des webhooks d'entreprise et de revendeur (`sha256=…` : `sms.status`, `call.completed`).

```ts
import { VoxNova, VoiceResponse, verifySignature } from '@voxnova/sdk';

const vx = new VoxNova({ apiKey: process.env.VX_KEY!, baseUrl: 'https://voip.exemple.fr' });
const ep = await vx.endpoints.create({ name: 'Accueil' });

// dans votre webhook
const r = new VoiceResponse().say(42).gather({ numDigits: 1, action: 'https://exemple.fr/menu' });
res.json(r);
```

```ts
// SMS et suivi
const sms = await vx.sms.send({ to: '0612345678', text: 'Votre code : 1234', tag: 'otp', sender: 'hCloud' });
const state = await vx.sms.get(sms.id); // status : queued → sent → delivered ; events[]
const { balance, monthlyLeft } = await vx.sms.balance();

// Revendeur : agir au nom d'un client (clé vxr_…)
const reseller = new VoxNova({ apiKey: process.env.VXR!, baseUrl: 'https://api.exemple.fr' });
const client = reseller.forOrganization('<id du client>');
await client.extensions.create({ number: '1001', displayName: 'Accueil' });
await client.flows.create({ name: 'Standard', graph: { nodes: [/* … */], edges: [/* … */] } });
await reseller.reseller.clients.applySmsPack('<id du client>', '<id du pack>');

// Webhooks (Express) : vérifier la signature sur le corps brut
app.post('/hook', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyWebhook(process.env.WH_SECRET!, req.body, req.header('x-voxnova-signature'))) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString()); // { event: 'sms.status', data: { status: 'delivered', … } }
  res.sendStatus(200);
});
```

Documentation interactive : `/api/v1/docs` (Swagger) ; guide : chapitres 19 et 30.

Documentation complète : chapitre 19 « Plateforme développeurs » et `GET /api/v1/openapi.json`.
