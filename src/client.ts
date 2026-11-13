/**
 * Client de l'API REST v1 (clé API vxk_…).
 */

export class VoxNovaError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
    this.name = 'VoxNovaError';
  }
}

export interface ClientOptions {
  /** Clé d'entreprise vxk_… ou clé revendeur vxr_… */
  apiKey: string;
  /** Clé revendeur uniquement : identifiant (ou identifiant court) du client au nom duquel agir (en-tête X-Organization). */
  organization?: string;
  /** Adresse du panneau, ex. https://voip.example.com */
  baseUrl: string;
  /** Délai par requête (15 s par défaut). */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface Application { id: string; name: string; voiceUrl: string; fallbackUrl: string | null; statusCallbackUrl: string | null; signingSecret: string; createdAt: string; updatedAt: string }
export interface ApplicationInput { name: string; voiceUrl: string; fallbackUrl?: string | null; statusCallbackUrl?: string | null }
export interface Registration { user: string; agent: string; ip: string; port: string; status: string; contact: string }
export interface SipCredentials { username: string; authUsername: string; password: string; domain: string; server: string; port: number; transports: string[]; outboundProxy: string; voicemailNumber: string; codecs: string[] }
export interface Endpoint {
  id: string;
  number: string;
  name: string;
  enabled: boolean;
  applicationId: string | null;
  voicemail: boolean;
  callerId: string | null;
  permission: 'INTERNAL' | 'NATIONAL' | 'INTERNATIONAL';
  recordCalls: boolean;
  forward: { always: string | null; busy: string | null; noAnswer: string | null; noAnswerSeconds: number };
  createdAt: string;
  registered?: boolean;
  sip?: SipCredentials;
  /** Configuration prête pour @voxnova/webphone (softphone navigateur) ; null si la passerelle WebRTC n'est pas activée. */
  webphone?: WebphoneConfig | null;
  registrations?: Registration[];
}
export interface WebphoneConfig { wsServers: string[]; uri: string; authorizationUser: string; password: string; realm: string; displayName?: string; registerExpires?: number; iceServers?: { urls: string | string[]; username?: string; credential?: string }[] }
export interface EndpointInput {
  number?: string;
  name: string;
  applicationId?: string | null;
  password?: string;
  voicemail?: boolean;
  callerId?: string | null;
  permission?: Endpoint['permission'];
  recordCalls?: boolean;
  enabled?: boolean;
  forward?: Partial<Endpoint['forward']>;
}
export interface PhoneNumber { number: string; label: string; destType: string | null; routing: Record<string, string> | null; monthlyPriceCents: number; createdAt: string }
export interface CallInput { to: string; applicationId: string; from?: string; url?: string; timeout?: number; vars?: Record<string, string | number | boolean> }
export interface Page<T> { items: T[]; total: number; page: number }

export type Json = Record<string, unknown>;
export interface Sms { id: string; to: string; text: string; status: 'queued' | 'sent' | 'delivered' | 'failed'; providerStatus: string | null; messageId: string | null; sender: string | null; tag: string | null; type: 'transactional' | 'marketing' | null; segments: number; channel: string | null; error: string | null; createdAt: string; sentAt: string | null; deliveredAt: string | null; events?: { status: string; at: string }[] }
export interface SmsInput { to: string; text: string; sender?: string; tag?: string; type?: 'transactional' | 'marketing'; channel?: 'sms' | 'whatsapp' | 'auto' }
export interface SmsCredits { monthlyLimit: number; monthlyUsed: number; monthlyLeft: number; balance: number; available: number }
export interface SmsPack { id: string; name: string; kind: 'MONTHLY' | 'LIFETIME'; credits: number; priceCents: number; active: boolean }
export interface SmsPackInput { name: string; kind: 'MONTHLY' | 'LIFETIME'; credits: number; priceCents?: number; active?: boolean }
export interface SenderBlock { id: string; kind: 'exact' | 'prefix' | 'contains'; value: string; reason: string }
export interface SenderBlockInput { value: string; kind?: SenderBlock['kind']; reason?: string }
export type WebhookEventName = 'call.completed' | 'sms.status';
export interface Webhook { id: string; url: string; events: WebhookEventName[]; enabled: boolean; lastStatus: string | null; createdAt: string; secret?: string }
export interface WebhookInput { url: string; events?: WebhookEventName[]; enabled?: boolean }
export interface Flow { id: string; name: string; number: string | null; description: string; enabled: boolean; graph: { nodes: Json[]; edges: Json[] }; updatedAt?: string }
export interface FlowInput { name: string; number?: string | null; description?: string; enabled?: boolean; graph: { nodes: Json[]; edges: Json[] } }
export interface ClientInput { company: string; name: string; email: string; password: string; product?: string; trialDays?: number }

const q = encodeURIComponent;

export class VoxNova {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    if (!opts.apiKey?.startsWith('vxk_') && !opts.apiKey?.startsWith('vxr_')) throw new Error('Clé API vxk_… (entreprise) ou vxr_… (revendeur) requise');
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.f = opts.fetch ?? fetch;
  }

  /** Revendeur : client agissant au nom d'un de vos clients (même clé vxr_, en-tête X-Organization). */
  forOrganization(organization: string): VoxNova {
    return new VoxNova({ ...this.opts, organization });
  }

  /** Requête brute vers l'API (chemin commençant par /api/). */
  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await this.f(`${this.base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, Accept: 'application/json', ...(this.opts.organization ? { 'X-Organization': this.opts.organization } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) throw new VoxNovaError((json as { error?: string })?.error ?? `HTTP ${res.status}`, res.status, json);
    return json as T;
  }

  readonly account = {
    get: () => this.request<{ id: string; name: string; product: string; status: string; sipDomain: string; limits: { endpoints: number; numbers: number; channels: number | null }; usage: { endpoints: number; numbers: number; applications: number } }>('GET', '/api/v1/account'),
    usage: () => this.request<{ month: string; label: string; lines: { label: string; quantity: number; unitCents: number; totalCents: number }[]; subtotalCents: number }>('GET', '/api/v1/usage'),
  };

  readonly applications = {
    list: () => this.request<Application[]>('GET', '/api/v1/applications'),
    create: (input: ApplicationInput) => this.request<Application>('POST', '/api/v1/applications', input),
    get: (id: string) => this.request<Application>('GET', `/api/v1/applications/${id}`),
    update: (id: string, input: Partial<ApplicationInput>) => this.request<Application>('PATCH', `/api/v1/applications/${id}`, input),
    rotateSecret: (id: string) => this.request<Application>('POST', `/api/v1/applications/${id}/secret`),
    delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/v1/applications/${id}`),
  };

  readonly endpoints = {
    list: () => this.request<Endpoint[]>('GET', '/api/v1/endpoints'),
    create: (input: EndpointInput) => this.request<Endpoint>('POST', '/api/v1/endpoints', input),
    /** Par identifiant ou numéro interne ; inclut les identifiants SIP et les appareils enregistrés. */
    get: (id: string) => this.request<Endpoint>('GET', `/api/v1/endpoints/${encodeURIComponent(id)}`),
    update: (id: string, input: Partial<EndpointInput>) => this.request<Endpoint>('PATCH', `/api/v1/endpoints/${encodeURIComponent(id)}`, input),
    registrations: (id: string) => this.request<Registration[]>('GET', `/api/v1/endpoints/${encodeURIComponent(id)}/registrations`),
    resetPassword: (id: string) => this.request<Endpoint>('POST', `/api/v1/endpoints/${encodeURIComponent(id)}/password`),
    disconnect: (id: string) => this.request<{ ok: true }>('POST', `/api/v1/endpoints/${encodeURIComponent(id)}/disconnect`),
    delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/v1/endpoints/${encodeURIComponent(id)}`),
  };

  readonly numbers = {
    list: () => this.request<PhoneNumber[]>('GET', '/api/v1/numbers'),
    available: (opts: { contains?: string; limit?: number } = {}) => this.request<{ number: string; monthlyPriceCents: number }[]>('GET', '/api/v1/numbers/available', undefined, opts),
    buy: (number: string, opts: { applicationId?: string; label?: string } = {}) => this.request<PhoneNumber>('POST', '/api/v1/numbers', { number, ...opts }),
    /** Relie le numéro à une application ou à un endpoint (null pour détacher). */
    route: (number: string, to: { applicationId?: string | null; endpointId?: string | null; label?: string }) => this.request<PhoneNumber>('PATCH', `/api/v1/numbers/${encodeURIComponent(number)}`, to),
    release: (number: string) => this.request<{ ok: true }>('DELETE', `/api/v1/numbers/${encodeURIComponent(number)}`),
  };

  readonly calls = {
    /** Appelle un endpoint ou un numéro ; au décroché, l'application prend la main (direction « api »). */
    create: (input: CallInput) => this.request<{ callId: string; status: string; to: string; from: string | null; applicationId: string }>('POST', '/api/v1/calls', input),
    live: () => this.request<{ online: boolean; calls: Record<string, unknown>[] }>('GET', '/api/v1/calls'),
    get: (id: string) => this.request<Record<string, unknown> & { status: 'in-progress' | 'completed' }>('GET', `/api/v1/calls/${id}`),
    hangup: (id: string) => this.request<{ ok: true }>('POST', `/api/v1/calls/${id}/hangup`),
    /** Reprend la main sur un appel en cours : `url` reçoit l'événement « redirect ». */
    redirect: (id: string, opts: { url?: string; applicationId?: string } = {}) => this.request<{ ok: true }>('POST', `/api/v1/calls/${id}/redirect`, opts),
  };

  readonly cdr = {
    list: (opts: { page?: number; pageSize?: number; since?: string } = {}) => this.request<Page<Record<string, unknown>>>('GET', '/api/v1/cdr', undefined, opts),
  };

  readonly recordings = {
    list: (opts: { page?: number; pageSize?: number; callId?: string } = {}) => this.request<Page<{ id: string; callId: string; applicationId: string | null; durationSec: number; createdAt: string }>>('GET', '/api/v1/recordings', undefined, opts),
    /** Lien d'écoute signé (5 minutes) : le fichier reste sur la plateforme. */
    url: (id: string) => this.request<{ url: string; expiresIn: number }>('POST', `/api/v1/recordings/${id}/url`),
    delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/v1/recordings/${id}`),
  };

  readonly audio = {
    list: () => this.request<{ id: string; name: string; durationSec: number }[]>('GET', '/api/v1/audio'),
    /** Envoie un fichier audio (MP3, WAV, AAC, M4A, OGG…) utilisable avec play({ audioId }). */
    upload: (file: Blob, name?: string) => {
      const form = new FormData();
      if (name) form.append('name', name);
      form.append('file', file, name ?? 'audio');
      return this.request<{ id: string; name: string; durationSec: number }>('POST', '/api/v1/audio', form);
    },
  };

  readonly logs = {
    list: (opts: { page?: number; pageSize?: number; callId?: string; applicationId?: string; errors?: boolean } = {}) => this.request<Page<Record<string, unknown>>>('GET', '/api/v1/logs', undefined, opts),
  };

  // ---------------------------------------------------------------- SMS
  readonly sms = {
    /** Met un SMS en file (statuts : webhook sms.status ou `get`). Refusé sans crédit ou si l'expéditeur est interdit. */
    send: (input: SmsInput) => this.request<Sms>('POST', '/api/v1/sms', input),
    list: (opts: { page?: number; pageSize?: number; status?: string; to?: string; tag?: string; since?: string } = {}) => this.request<Page<Sms>>('GET', '/api/v1/sms', undefined, opts),
    /** Par identifiant ou messageId du fournisseur, avec les événements de remise (accepted, sent, delivered…). */
    get: (id: string) => this.request<Sms>('GET', `/api/v1/sms/${q(id)}`),
    /** Forfait du mois (remis à zéro chaque mois) et solde à vie. */
    balance: () => this.request<SmsCredits>('GET', '/api/v1/sms/balance'),
  };

  /** Webhooks de l'entreprise : call.completed, sms.status (signés, voir `verifyWebhook`). */
  readonly webhooks = {
    list: () => this.request<Webhook[]>('GET', '/api/v1/webhooks'),
    /** Le secret de signature n'est renvoyé qu'à la création. */
    create: (input: WebhookInput) => this.request<Webhook>('POST', '/api/v1/webhooks', input),
    update: (id: string, input: Partial<WebhookInput>) => this.request<Webhook>('PATCH', `/api/v1/webhooks/${q(id)}`, input),
    delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/v1/webhooks/${q(id)}`),
  };

  // ---------------------------------------------------------------- panneau d'une entreprise (clé revendeur + organization)
  /** Toute route du panneau (voir la documentation Swagger) : `vx.panel.get('/api/centrex/queues')`. */
  readonly panel = {
    get: <T = unknown>(path: string, query?: Record<string, string | number | boolean | undefined>) => this.request<T>('GET', path, undefined, query),
    post: <T = unknown>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {}),
    put: <T = unknown>(path: string, body?: unknown) => this.request<T>('PUT', path, body ?? {}),
    patch: <T = unknown>(path: string, body?: unknown) => this.request<T>('PATCH', path, body ?? {}),
    delete: <T = unknown>(path: string) => this.request<T>('DELETE', path),
  };

  private crud<T = Json, I = Json>(base: string, update: 'PUT' | 'PATCH' = 'PUT') {
    return {
      list: () => this.request<T[]>('GET', base),
      create: (input: I) => this.request<T>('POST', base, input),
      update: (id: string, input: Partial<I>) => this.request<T>(update, `${base}/${q(id)}`, input),
      delete: (id: string) => this.request<{ ok: true }>('DELETE', `${base}/${q(id)}`),
    };
  }

  /** Utilisateurs de l'entreprise (invitation par e-mail, droits). */
  readonly users = { ...this.crud('/api/org/users', 'PATCH'), invite: (id: string) => this.request<Json>('POST', `/api/org/users/${q(id)}/invite`, {}), permissions: (id: string, permissions: string[]) => this.request<Json>('PUT', `/api/org/users/${q(id)}/permissions`, { permissions }) };
  /** Postes (extensions) : création, modification complète, mot de passe SIP, état d'enregistrement. */
  readonly extensions = { ...this.crud('/api/org/extensions'), sipAccount: (id: string) => this.request<Json>('GET', `/api/org/extensions/${q(id)}/sip-account`), resetSipPassword: (id: string) => this.request<Json>('POST', `/api/org/extensions/${q(id)}/sip-password`, {}), status: (id: string) => this.request<Json>('GET', `/api/org/extensions/${q(id)}/status`) };
  /** Scénarios d'appel (flow) : graphe de blocs, validation et simulation sans appel réel. */
  readonly flows = {
    list: () => this.request<Pick<Flow, 'id' | 'name' | 'number' | 'description' | 'enabled'>[]>('GET', '/api/centrex/flows'),
    get: (id: string) => this.request<Flow>('GET', `/api/centrex/flows/${q(id)}`),
    create: (input: FlowInput) => this.request<Flow>('POST', '/api/centrex/flows', input),
    update: (id: string, input: Partial<FlowInput>) => this.request<Flow>('PUT', `/api/centrex/flows/${q(id)}`, input),
    delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/centrex/flows/${q(id)}`),
    validate: (graph: Flow['graph']) => this.request<{ errors: string[]; warnings: string[] }>('POST', '/api/centrex/flows/validate', { graph }),
    simulate: (graph: Flow['graph'], opts: { caller?: string; did?: string; digits?: string[] } = {}) => this.request<Json>('POST', '/api/centrex/flows/simulate', { graph, ...opts }),
  };
  readonly queues = this.crud('/api/centrex/queues');
  readonly ringGroups = this.crud('/api/centrex/ring-groups');
  readonly ivr = this.crud('/api/centrex/ivr');
  readonly timeConditions = this.crud('/api/centrex/time-conditions');
  readonly conferences = this.crud('/api/centrex/conferences');

  // ---------------------------------------------------------------- revendeur (clé vxr_)
  readonly reseller = {
    me: () => this.request<Json>('GET', '/api/reseller/me'),
    clients: {
      list: (search?: string) => this.request<Json[]>('GET', '/api/reseller/clients', undefined, { q: search }),
      get: (id: string) => this.request<Json>('GET', `/api/reseller/clients/${q(id)}`),
      create: (input: ClientInput) => this.request<Json>('POST', '/api/reseller/clients', input),
      /** Suspension, réactivation, prolongation d'essai. */
      update: (id: string, input: { status?: 'ACTIVE' | 'SUSPENDED'; extendTrialDays?: number }) => this.request<Json>('PATCH', `/api/reseller/clients/${q(id)}`, input),
      subscribe: (id: string, input: Json) => this.request<Json>('POST', `/api/reseller/clients/${q(id)}/subscription`, input),
      sms: (id: string) => this.request<{ credits: SmsCredits; blocks: SenderBlock[] }>('GET', `/api/reseller/clients/${q(id)}/sms`),
      /** MONTHLY remplace le forfait mensuel ; LIFETIME ajoute au solde à vie. */
      applySmsPack: (id: string, packId: string) => this.request<SmsCredits>('POST', `/api/reseller/clients/${q(id)}/sms/pack`, { packId }),
      blockSender: (id: string, input: SenderBlockInput) => this.request<SenderBlock>('POST', `/api/reseller/clients/${q(id)}/sms/sender-blocks`, input),
    },
    catalog: () => this.request<Json>('GET', '/api/reseller/catalog'),
    plans: this.crud('/api/reseller/plans'),
    invoices: { list: () => this.request<Json[]>('GET', '/api/reseller/invoices'), validate: (id: string, input: Json = {}) => this.request<Json>('POST', `/api/reseller/invoices/${q(id)}/validate`, input), cancel: (id: string, input: Json = {}) => this.request<Json>('POST', `/api/reseller/invoices/${q(id)}/cancel`, input) },
    smsPacks: this.crud<SmsPack, SmsPackInput>('/api/reseller/sms/packs'),
    senderBlocks: { list: () => this.request<SenderBlock[]>('GET', '/api/reseller/sms/sender-blocks'), create: (input: SenderBlockInput) => this.request<SenderBlock>('POST', '/api/reseller/sms/sender-blocks', input), delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/reseller/sms/sender-blocks/${q(id)}`) },
    /** SMS de tous vos clients. */
    sms: (opts: { orgId?: string; status?: string; page?: number } = {}) => this.request<{ total: number; items: Json[] }>('GET', '/api/reseller/sms', undefined, opts),
    /** Webhooks recevant les événements de tous vos clients (sms.status). */
    webhooks: { list: () => this.request<Webhook[]>('GET', '/api/reseller/webhooks'), create: (input: { url: string; events?: 'sms.status'[]; enabled?: boolean }) => this.request<Webhook>('POST', '/api/reseller/webhooks', input), update: (id: string, input: Partial<WebhookInput>) => this.request<Webhook>('PATCH', `/api/reseller/webhooks/${q(id)}`, input), delete: (id: string) => this.request<{ ok: true }>('DELETE', `/api/reseller/webhooks/${q(id)}`) },
  };
}
