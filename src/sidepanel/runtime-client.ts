import {protocolVersion, resultStatuses, type CompanionStatus, type RuntimeResult} from '../core/runtime';

export interface Pairing {port: number; token: string}

export async function request(pairing: Pairing, operation: 'status' | 'connect' | 'disconnect' | 'validate' | 'cancel' | 'source-analyze' | 'source-transform',
  payload: object = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response;
  const timeout = AbortSignal.timeout(15_000);
  try {
    response = await fetch(`http://127.0.0.1:${pairing.port}/api/v1/${operation}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + pairing.token},
      body: JSON.stringify({protocol: protocolVersion, ...payload}), redirect: 'error', credentials: 'omit',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw Error(signal?.aborted ? 'Validation cancelled.' : timeout.aborted
      ? 'The companion request timed out.' : 'Companion unavailable. Check the service port and approved extension ID.');
  }
  const data: unknown = await response.json();
  if (!record(data) || data.protocol !== protocolVersion) throw Error('Incompatible companion protocol.');
  if (!response.ok) throw Error(typeof data.message === 'string' ? data.message.slice(0, 200) : 'The companion rejected the request.');
  return data;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function readStatus(data: Record<string, unknown>): CompanionStatus {
  const {connected, browserId, serviceVersion, pythonVersion, playwrightVersion, browserVersion} = data;
  if (typeof connected !== 'boolean' || (browserId !== null && typeof browserId !== 'string') ||
    typeof serviceVersion !== 'string' || typeof pythonVersion !== 'string' || typeof playwrightVersion !== 'string' ||
    (browserVersion !== null && typeof browserVersion !== 'string')) throw Error('Invalid companion status response.');
  const strategies = Array.isArray(data.strategies) ? data.strategies.filter((value): value is string => typeof value === 'string') : undefined;
  return {connected, browserId, serviceVersion, pythonVersion, playwrightVersion, browserVersion, strategies};
}

export function readResults(data: Record<string, unknown>, expected: {requestId: string; browserId: string;
  documentKey: string; strategies: readonly RuntimeResult['strategy'][]}): RuntimeResult[] {
  if (data.requestId !== expected.requestId || data.browserId !== expected.browserId ||
    data.documentKey !== expected.documentKey || !Array.isArray(data.results) ||
    data.results.length !== expected.strategies.length) throw Error('The response does not match the validation request.');
  return data.results.map((value: unknown, index) => {
    const strategy = expected.strategies[index];
    if (!record(value) || value.method !== 'playwright' || value.strategy !== strategy ||
      !resultStatuses.includes(value.status as RuntimeResult['status']) ||
      !['confirmed', 'wrong', 'unverified', 'stale'].includes(value.identity as string) ||
      typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp)) ||
      typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0 ||
      (value.count !== undefined && (!Number.isInteger(value.count) || Number(value.count) < 0))) {
      throw Error('Invalid companion validation result.');
    }
    const result: RuntimeResult = {method: 'playwright', strategy, status: value.status as RuntimeResult['status'],
      identity: value.identity as RuntimeResult['identity'], timestamp: value.timestamp, durationMs: value.durationMs};
    if (typeof value.count === 'number') result.count = value.count;
    if (typeof value.rootCount === 'number' && Number.isInteger(value.rootCount) && value.rootCount >= 0) result.rootCount = value.rootCount;
    if (value.rootIdentity === 'confirmed' || value.rootIdentity === 'wrong' || value.rootIdentity === 'unverified') {
      result.rootIdentity = value.rootIdentity;
    }
    const cardinality = {'unique-target': [1, 'confirmed'], 'unique-unverified': [1, 'unverified'],
      'wrong-target': [1, 'wrong'], 'no-match': [0, 'unverified']} as const;
    const required = cardinality[result.status as keyof typeof cardinality];
    if ((required && (result.count !== required[0] || result.identity !== required[1])) ||
      (result.status === 'ambiguous' && (result.count ?? 0) < 2)) throw Error('Inconsistent companion match evidence.');
    if (typeof value.message === 'string') result.message = value.message.slice(0, 200);
    if (typeof value.stateError === 'string') result.stateError = value.stateError.slice(0, 200);
    if (record(value.states)) {
      result.states = {};
      for (const key of ['attached', 'visible', 'enabled', 'editable', 'readOnly', 'checked'] as const) {
        const state = value.states[key];
        if (typeof state === 'boolean' || state === null) result.states[key] = state;
      }
    }
    if (record(value.actionability) && ['click', 'hover', 'check', 'fill', 'select'].includes(value.actionability.action as string) &&
      ['passed', 'timeout', 'failed', 'unsupported', 'unverified'].includes(value.actionability.status as string)) {
      result.actionability = {action: value.actionability.action as NonNullable<RuntimeResult['actionability']>['action'],
        status: value.actionability.status as string};
    }
    return result;
  });
}
