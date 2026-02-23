import { loadConfig } from '../../src/config.js';

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
