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
  apiKey: string;
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
  registrations?: Registration[];
}
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

export class VoxNova {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    if (!opts.apiKey?.startsWith('vxk_')) throw new Error('Clé API vxk_… requise');
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.f = opts.fetch ?? fetch;
  }

  /** Requête brute vers l'API (chemin commençant par /api/v1/). */
  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const qs = query ? Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await this.f(`${this.base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, Accept: 'application/json', ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
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
}
