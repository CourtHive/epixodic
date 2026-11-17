import { clientAddress, resolveClientIpHeader } from './clientAddress.js';
import { describe, expect, it } from 'vitest';

const HEADER = 'cf-connecting-ip';

describe('clientAddress', () => {
  it('keys on the socket address when no header is configured', () => {
    expect(clientAddress({ address: '127.0.0.1', headers: { [HEADER]: '203.0.113.7' } })).toBe('127.0.0.1');
  });

  it('believes the configured header from a loopback peer', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(clientAddress({ address, headers: { [HEADER]: '203.0.113.7' } }, HEADER)).toBe('203.0.113.7');
    }
    expect(clientAddress({ address: '::1', headers: { [HEADER]: '2001:db8::1' } }, HEADER)).toBe('2001:db8::1');
  });

  // A client reaching the relay's port directly could set the header to anything.
  it('ignores the header from a peer that is not loopback', () => {
    expect(clientAddress({ address: '10.128.0.5', headers: { [HEADER]: '203.0.113.7' } }, HEADER)).toBe('10.128.0.5');
  });

  it('falls back to the socket address for a missing, list-shaped or non-IP value', () => {
    for (const value of [undefined, '', '203.0.113.7, 198.51.100.1', 'not-an-ip', '203.0.113.7:443']) {
      expect(clientAddress({ address: '127.0.0.1', headers: { [HEADER]: value } }, HEADER)).toBe('127.0.0.1');
    }
  });

  it('reads the first value of a repeated header, and matches the name case-insensitively', () => {
    const handshake = { address: '127.0.0.1', headers: { [HEADER]: ['203.0.113.7', '198.51.100.1'] } };
    expect(clientAddress(handshake, 'CF-Connecting-IP')).toBe('203.0.113.7');
  });

  it('reports "unknown" for a socket with no address', () => {
    expect(clientAddress({ headers: {} }, HEADER)).toBe('unknown');
  });
});

describe('resolveClientIpHeader', () => {
  it('lower-cases a name and treats unset or blank as off', () => {
    expect(resolveClientIpHeader(' CF-Connecting-IP ')).toBe('cf-connecting-ip');
    expect(resolveClientIpHeader(undefined)).toBeUndefined();
    expect(resolveClientIpHeader('  ')).toBeUndefined();
  });
});
