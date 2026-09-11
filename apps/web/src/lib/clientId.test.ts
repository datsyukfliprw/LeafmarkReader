import { describe, expect, it } from 'vitest';
import { newClientId } from './clientId';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('newClientId', () => {
  it('uses randomUUID when available', () => {
    const value = '123e4567-e89b-42d3-a456-426614174000';
    expect(newClientId({ randomUUID: () => value })).toBe(value);
  });

  it('creates a valid UUID when randomUUID is unavailable on LAN HTTP', () => {
    const source = {
      getRandomValues(array: Uint8Array) {
        for (let i = 0; i < array.length; i += 1) array[i] = i;
        return array;
      },
    };
    expect(newClientId(source)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('still returns a UUID without Web Crypto', () => {
    expect(newClientId(null)).toMatch(uuidV4);
  });
});
