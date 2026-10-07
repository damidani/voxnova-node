import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Instructions vocales (dial plan en code) : votre webhook répond par une liste JSON d'instructions,
 * construite ici avec VoiceResponse.
 */

export type Verb = { verb: string; [key: string]: unknown };

export interface AudioSource {
  /** Fichier audio distant (MP3, WAV, AAC, M4A, OGG…), converti et mis en cache par la plateforme. */
  url?: string;
  /** Fichier audio envoyé par l'API (/api/v1/audio). */
  audioId?: string;
  /** Son intégré du moteur, ex. « ivr/ivr-welcome.wav ». */
  sound?: string;
}

export interface GatherOptions extends AudioSource {
  /** Nombre exact de chiffres attendus (raccourci pour minDigits = maxDigits). */
  numDigits?: number;
  minDigits?: number;
  maxDigits?: number;
  /** Délai d'attente de la première touche, en secondes (5 par défaut). */
  timeout?: number;
  /** Délai entre deux touches, en secondes (3 par défaut). */
  interDigitTimeout?: number;
  /** Touche de fin de saisie : « # » (par défaut), « * » ou « » (aucune). */
  finishOnKey?: '#' | '*' | '';
  /** Nombre d'essais (annonce rejouée). */
  tries?: number;
  /** URL rappelée avec `digits` (par défaut : l'URL qui a produit ces instructions). */
  action?: string;
}

export interface RecordOptions {
  maxSeconds?: number;
  /** Fin automatique après N secondes de silence (5 par défaut). */
  silenceSeconds?: number;
  beep?: boolean;
  finishOnKey?: string;
  /** URL rappelée avec `recording: { id, duration }`. */
  action?: string;
}

export type DialTarget = { endpoint: string } | { number: string };

export interface DialOptions {
  /** Délai de sonnerie en secondes (30 par défaut). */
  timeout?: number;
  /** Numéro présenté (l'un de vos numéros). */
  callerId?: string;
  /** Plusieurs destinations : en même temps (par défaut) ou l'une après l'autre. */
  strategy?: 'simultaneous' | 'sequential';
  /** Enregistrer la communication. */
  record?: boolean;
  /** URL rappelée avec `dial: { status, answered, hangupCause }` à la fin (sinon l'appel se termine s'il a abouti). */
  action?: string;
}

export interface ConferenceOptions {
  muted?: boolean;
  moderator?: boolean;
  endOnExit?: boolean;
  waitForModerator?: boolean;
  beep?: boolean;
}

export class VoiceResponse {
  private readonly verbs: Verb[] = [];

  private push(verb: string, data: Record<string, unknown> = {}) {
    this.verbs.push({ verb, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) });
    return this;
  }

  answer() {
    return this.push('answer');
  }
  /** Joue un fichier audio (URL, fichier envoyé ou son intégré). */
  play(source: string | AudioSource, opts: { loop?: number } = {}) {
    return this.push('play', { ...(typeof source === 'string' ? { url: source } : source), ...opts });
  }
  /** Prononce un nombre (« quarante-deux ») ou ses chiffres un par un. */
  say(value: string | number, opts: { as?: 'number' | 'digits'; language?: 'fr' | 'en' } = {}) {
    return this.push('say', { value: String(value), ...opts });
  }
  pause(seconds = 1) {
    return this.push('pause', { seconds });
  }
  /** Variables de l'appel, renvoyées dans chaque webhook (`vars`). */
  set(vars: Record<string, string | number | boolean>) {
    return this.push('set', { vars });
  }
  gather(opts: GatherOptions = {}) {
    return this.push('gather', { ...opts });
  }
  record(opts: RecordOptions = {}) {
    return this.push('record', { ...opts });
  }
  /** Appelle un endpoint SIP, un numéro, ou plusieurs destinations. */
  dial(target: DialTarget | DialTarget[], opts: DialOptions = {}) {
    return this.push('dial', { ...(Array.isArray(target) ? { targets: target } : target), ...opts });
  }
  /** Redemande des instructions à une autre URL. */
  redirect(url: string) {
    return this.push('redirect', { url });
  }
  /** File d'attente (identifiant ou numéro interne). */
  queue(queue: string) {
    return this.push('queue', { queue });
  }
  /** Conférence nommée (créée à la première arrivée). */
  conference(name: string, opts: ConferenceOptions = {}) {
    return this.push('conference', { name, ...opts });
  }
  /** Messagerie vocale d'un endpoint. */
  voicemail(endpoint: string) {
    return this.push('voicemail', { endpoint });
  }
  /** Transfert vers un numéro interne (poste, groupe, standard vocal…) ou externe. */
  transfer(to: string) {
    return this.push('transfer', { to });
  }
  hangup(cause?: string) {
    return this.push('hangup', { cause });
  }

  toJSON(): Verb[] {
    return this.verbs;
  }
  toString() {
    return JSON.stringify(this.verbs);
  }
}

// ------------------------------------------------------------------ webhooks
export type WebhookEvent = 'call.incoming' | 'gather' | 'dial' | 'record' | 'redirect';

/** Corps des requêtes envoyées à votre voiceUrl et à vos URL d'action. */
export interface VoiceRequest {
  event: WebhookEvent;
  callId: string;
  applicationId: string;
  accountId: string;
  /** inbound : appel reçu sur un numéro ; endpoint : appel émis par un endpoint ; api : appel lancé par l'API. */
  direction: 'inbound' | 'endpoint' | 'api';
  from: string;
  to: string;
  callerName: string;
  /** Endpoint à l'origine de l'appel (direction « endpoint »). */
  endpoint?: string;
  vars: Record<string, string>;
  timestamp: string;
  digits?: string;
  dial?: { status: 'completed' | 'busy' | 'no-answer' | 'canceled' | 'failed'; answered: boolean; hangupCause: string };
  recording?: { id: string; duration: number } | null;
  /** Présent quand la requête est envoyée à l'URL de secours. */
  fallback?: boolean;
  error?: string;
}

/** Corps envoyé à statusCallbackUrl à la fin de l'appel. */
export interface StatusCallback {
  event: 'call.completed';
  callId: string;
  applicationId: string;
  accountId: string;
  direction: string;
  from: string;
  to: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string;
  duration: number;
  billsec: number;
  hangupCause: string | null;
  costCents: number;
}

/**
 * Vérifie l'en-tête X-VoxNova-Signature (« t=<horodatage>,v1=<HMAC-SHA256 hex> ») sur le corps brut de la requête.
 * Refuse les requêtes de plus de `toleranceSec` secondes (rejeu).
 */
export function verifySignature(secret: string, rawBody: string | Buffer, header: string | undefined | null, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const ts = Number(parts.t);
  if (!ts || !parts.v1 || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${ts}.${rawBody.toString()}`).digest('hex'));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
