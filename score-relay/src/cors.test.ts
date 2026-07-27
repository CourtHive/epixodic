import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyCorsHeaders, resolveAllowedOrigin } from './cors.js';

function fakeReq(origin?: string): IncomingMessage {
  return { headers: origin === undefined ? {} : { origin } } as unknown as IncomingMessage;
}

function fakeRes(): ServerResponse & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as ServerResponse & { headers: Record<string, string> };
}

describe('resolveAllowedOrigin', () => {
  it("echoes the request origin under a '*' policy", () => {
    expect(resolveAllowedOrigin('http://localhost:5173', '*')).toBe('http://localhost:5173');
  });

  it("falls back to '*' when no origin under a '*' policy", () => {
    expect(resolveAllowedOrigin(undefined, '*')).toBe('*');
  });

  it('echoes an allowlisted origin on exact match', () => {
    const allow = ['http://localhost:5173', 'https://app.courthive.net'];
    expect(resolveAllowedOrigin('https://app.courthive.net', allow)).toBe('https://app.courthive.net');
  });

  it('rejects an origin not on the allowlist', () => {
    expect(resolveAllowedOrigin('http://evil.example', ['http://localhost:5173'])).toBeUndefined();
  });

  it('rejects when the request has no origin under an allowlist', () => {
    expect(resolveAllowedOrigin(undefined, ['http://localhost:5173'])).toBeUndefined();
  });
});

describe('applyCorsHeaders', () => {
  it('sets ACAO + preflight headers for an allowed origin', () => {
    const res = fakeRes();
    applyCorsHeaders(fakeReq('http://localhost:5173'), res, ['http://localhost:5173']);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Authorization, Content-Type');
    expect(res.headers['Vary']).toBe('Origin');
  });

  it('writes no headers for a disallowed origin', () => {
    const res = fakeRes();
    applyCorsHeaders(fakeReq('http://evil.example'), res, ['http://localhost:5173']);
    expect(res.headers).toEqual({});
  });
});
