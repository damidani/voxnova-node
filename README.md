# @voxnova/sdk

SDK TypeScript de la plateforme développeurs VoxNova (Node 18+, sans dépendance).

- `VoxNova` : client de l'API REST v1 (applications, endpoints SIP, numéros, appels, enregistrements, journal).
- `VoiceResponse` : construction des instructions renvoyées par votre webhook (dial plan en code).
- `verifySignature` : vérification de l'en-tête `X-VoxNova-Signature`.

```ts
import { VoxNova, VoiceResponse, verifySignature } from '@voxnova/sdk';

const vx = new VoxNova({ apiKey: process.env.VX_KEY!, baseUrl: 'https://voip.exemple.fr' });
const ep = await vx.endpoints.create({ name: 'Accueil' });

// dans votre webhook
const r = new VoiceResponse().say(42).gather({ numDigits: 1, action: 'https://exemple.fr/menu' });
res.json(r);
```

Documentation complète : chapitre 19 « Plateforme développeurs » et `GET /api/v1/openapi.json`.
