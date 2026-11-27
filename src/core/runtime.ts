import type {Locator} from './locator';

export const protocolVersion = 1;
export const evidenceLifetime = 30_000;
export const resultStatuses = ['unique-target', 'unique-unverified', 'ambiguous', 'wrong-target', 'no-match',
  'stale-target', 'stale-document', 'timeout', 'validation-error'] as const;
export type Trial = 'none' | 'click' | 'hover' | 'check' | 'fill' | 'select';
export type ResultStatus = typeof resultStatuses[number];
export type RuntimePolicy = 'browser' | 'runtime' | 'confirmed';

export interface Correlation {
  attribute: string;
  nonce: string;
  target: boolean;
}

export interface RuntimeResult {
  method: 'playwright';
  strategy: Locator['strategy'];
  status: ResultStatus;
  identity: 'confirmed' | 'wrong' | 'unverified' | 'stale';
  timestamp: string;
  durationMs: number;
  count?: number;
  message?: string;
  states?: Partial<Record<'attached' | 'visible' | 'enabled' | 'editable' | 'readOnly' | 'checked', boolean | null>>;
  stateError?: string;
  actionability?: {action: Trial; status: string};
}

export interface RuntimeEvidence extends RuntimeResult {
  requestId: string;
  browserId: string;
  documentKey: string;
  candidateId: string;
  elementId: string;
  testIdAttribute: string;
  expiresAt: number;
  freshness: 'current' | 'historical';
}

export interface CompanionStatus {
  serviceVersion: string;
  pythonVersion: string;
  playwrightVersion: string;
  browserVersion: string | null;
  browserId: string | null;
  connected: boolean;
}

export function currentEvidence(evidence?: RuntimeEvidence, now = Date.now()) {
  return evidence?.freshness === 'current' && evidence.expiresAt > now ? evidence : undefined;
}

export function runtimeRejects(evidence?: RuntimeEvidence) {
  const result = currentEvidence(evidence);
  return !!result && ['wrong-target', 'ambiguous', 'no-match', 'stale-target', 'stale-document'].includes(result.status);
}
