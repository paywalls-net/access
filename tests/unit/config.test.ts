import { jest } from '@jest/globals';
import { readFileSync as realReadFileSync } from 'node:fs';

// Mock node:fs so loadCredentialsFile() doesn't read the real credentials file.
// We intercept readFileSync: if the path ends with credentials.json, throw ENOENT
// so loadConfig falls through to defaults. Everything else delegates to the real fs.
jest.unstable_mockModule('node:fs', () => {
  const actual = jest.requireActual('node:fs') as typeof import('node:fs');
  return {
    ...actual,
    readFileSync: jest.fn((path: string, ...rest: any[]) => {
      if (typeof path === 'string' && path.includes('credentials.json')) {
        const err: any = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return (actual.readFileSync as any)(path, ...rest);
    }),
  };
});

// Dynamic import after mock setup
const { loadConfig } = await import('../../src/config.js');

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PAYWALLS_API_KEY;
    delete process.env.PAYWALLS_BASE_URL;
    delete process.env.PAYWALLS_ACCOUNT_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns default base URL when nothing is configured', () => {
    const config = loadConfig();
    expect(config.baseUrl).toBe('https://api.paywalls.net');
  });

  it('returns empty API key when nothing is configured', () => {
    const config = loadConfig();
    expect(config.apiKey).toBe('');
  });

  it('reads API key from environment variable', () => {
    process.env.PAYWALLS_API_KEY = 'test-key-123';
    const config = loadConfig();
    expect(config.apiKey).toBe('test-key-123');
  });

  it('reads base URL from environment variable', () => {
    process.env.PAYWALLS_BASE_URL = 'http://localhost:3000';
    const config = loadConfig();
    expect(config.baseUrl).toBe('http://localhost:3000');
  });

  it('inline overrides take precedence over env vars', () => {
    process.env.PAYWALLS_API_KEY = 'env-key';
    const config = loadConfig({ apiKey: 'override-key' });
    expect(config.apiKey).toBe('override-key');
  });

  it('reads account ID from environment variable', () => {
    process.env.PAYWALLS_ACCOUNT_ID = 'ACCT-01-XYZ';
    const config = loadConfig();
    expect(config.accountId).toBe('ACCT-01-XYZ');
  });
});
