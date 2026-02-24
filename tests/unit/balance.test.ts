/**
 * Balance command — unit tests
 *
 * Structure:
 *  1. Pure function tests (formatBalance)
 *  2. API orchestration (correct URLs called, call order)
 *  3. Output structure (JSON shape, ERR shape)
 *
 * @see paywalls-site-3v5.3.2
 * @see src/cli/balance.ts
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock config module to isolate from real credentials file
// ---------------------------------------------------------------------------
jest.unstable_mockModule('../../src/config.js', () => ({
  loadConfig: jest.fn((overrides?: any) => ({
    apiKey: overrides?.apiKey ?? process.env.PAYWALLS_API_KEY ?? '',
    baseUrl: overrides?.baseUrl ?? process.env.PAYWALLS_BASE_URL ?? 'https://api.paywalls.net',
    accountId: overrides?.accountId ?? process.env.PAYWALLS_ACCOUNT_ID,
  })),
  saveCredentials: jest.fn(),
  hasCredentials: jest.fn(() => false),
}));

// Dynamic imports — must be after jest.unstable_mockModule
const { ApiClient } = await import('../../src/api-client.js');
const { formatBalance } = await import('../../src/cli/balance.js');

// ---------------------------------------------------------------------------
// 1. Pure function tests — no mocks needed
// ---------------------------------------------------------------------------

describe('formatBalance', () => {
  it('formats millicents as $X.XX', () => {
    expect(formatBalance(150000)).toBe('$1.50');
    expect(formatBalance(100000)).toBe('$1.00');
  });

  it('formats zero', () => {
    expect(formatBalance(0)).toBe('$0.00');
  });

  it('handles sub-cent amounts', () => {
    expect(formatBalance(1)).toBe('$0.00');
    expect(formatBalance(999)).toBe('$0.01');
  });

  it('handles large balances', () => {
    expect(formatBalance(10_000_000_000)).toBe('$100000.00');
  });
});

// ---------------------------------------------------------------------------
// 2–3. Integration tests — API orchestration + output structure
// ---------------------------------------------------------------------------

let mockGet: jest.SpiedFunction<typeof ApiClient.prototype.get>;
let mockGetResponses: Record<string, { ok: boolean; status: number; data: any }>;

mockGet = jest.spyOn(ApiClient.prototype, 'get').mockImplementation(async (path: string) => {
  const response = mockGetResponses[path];
  if (!response) return { ok: false, status: 404, data: { error: 'Not found' } };
  return response;
});

let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args: any[]) => consoleOutput.push(args.join(' '));
  console.error = (...args: any[]) => consoleErrors.push(args.join(' '));
  mockGetResponses = {};
  mockGet.mockClear();
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit');
}) as any);
afterAll(() => mockExit.mockRestore());

const meResponse = {
  ok: true, status: 200,
  data: { account_id: 'TEST-01-ACCT', account_name: 'Test Account', user_id: 1, user_type: 'service-user' },
};

describe('paywalls balance', () => {
  let balance: (args: string[]) => Promise<void>;
  beforeAll(async () => {
    const mod = await import('../../src/cli/balance.js');
    balance = mod.balance;
  });

  // ---- Error handling: ERR structure ----

  describe('error handling', () => {
    const origKey = process.env.PAYWALLS_API_KEY;
    afterEach(() => {
      if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
      else delete process.env.PAYWALLS_API_KEY;
    });

    it('exits(1) with ERR structure when no API key', async () => {
      process.env.PAYWALLS_API_KEY = '';
      await expect(balance(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output).toHaveProperty('reason');
      expect(output).toHaveProperty('resolution');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits(1) with ERR including HTTP status when /api/me fails', async () => {
      process.env.PAYWALLS_API_KEY = 'bad-key';
      mockGetResponses['/api/me'] = { ok: false, status: 401, data: { error: 'Unauthorized' } };

      await expect(balance(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output.reason).toMatch(/401/);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits(1) with ERR when wallet not found (404)', async () => {
      process.env.PAYWALLS_API_KEY = 'test-key';
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: false, status: 404, data: { error: 'Wallet not found' },
      };

      await expect(balance(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output.reason).toMatch(/TEST-01-ACCT/); // includes the account ID
      expect(output).toHaveProperty('resolution');
    });
  });

  // ---- API orchestration ----

  describe('API orchestration', () => {
    const origKey = process.env.PAYWALLS_API_KEY;
    const origAcctId = process.env.PAYWALLS_ACCOUNT_ID;
    beforeEach(() => { process.env.PAYWALLS_API_KEY = 'test-key'; });
    afterEach(() => {
      if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
      else delete process.env.PAYWALLS_API_KEY;
      if (origAcctId !== undefined) process.env.PAYWALLS_ACCOUNT_ID = origAcctId;
      else delete process.env.PAYWALLS_ACCOUNT_ID;
    });

    it('calls /api/me first, then /api/wallet/:id/balance', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 500000 },
      };

      await balance([]);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls[0]).toBe('/api/me');
      expect(calls[1]).toBe('/api/wallet/TEST-01-ACCT/balance');
    });

    it('skips /api/me when PAYWALLS_ACCOUNT_ID is set', async () => {
      process.env.PAYWALLS_ACCOUNT_ID = 'KNOWN-ACCT';
      mockGetResponses['/api/wallet/KNOWN-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 0 },
      };

      await balance([]);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls[0]).toBe('/api/wallet/KNOWN-ACCT/balance');
      expect(calls.some(c => c === '/api/me')).toBe(false);
    });

    it('uses account_id from /api/me response to build wallet URL', async () => {
      const customMe = {
        ok: true, status: 200,
        data: { account_id: 'DYNAMIC-99-ID', account_name: 'Dynamic', user_id: 2, user_type: 'user' },
      };
      mockGetResponses['/api/me'] = customMe;
      mockGetResponses['/api/wallet/DYNAMIC-99-ID/balance'] = {
        ok: true, status: 200, data: { balance: 42000 },
      };

      await balance(['--json']);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls[1]).toBe('/api/wallet/DYNAMIC-99-ID/balance');
    });
  });

  // ---- JSON output structure ----

  describe('JSON output structure', () => {
    const origKey = process.env.PAYWALLS_API_KEY;
    beforeEach(() => { process.env.PAYWALLS_API_KEY = 'test-key'; });
    afterEach(() => {
      if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
      else delete process.env.PAYWALLS_API_KEY;
    });

    it('has account_id, balance, balance_formatted, currency', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 500000 },
      };

      await balance(['--json']);
      const output = JSON.parse(consoleOutput.join(''));

      expect(output).toEqual({
        account_id: 'TEST-01-ACCT',
        account_name: 'Test Account',
        balance: 500000,
        balance_formatted: formatBalance(500000),
        currency: 'USD',
      });
    });

    it('balance_formatted is computed from raw balance (not passthrough)', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 12345 },
      };

      await balance(['--json']);
      const output = JSON.parse(consoleOutput.join(''));

      // Verify it matches our pure function, not a mock value
      expect(output.balance).toBe(12345);
      expect(output.balance_formatted).toBe(formatBalance(12345));
    });
  });

  // ---- Headless behavior ----

  describe('headless mode', () => {
    const origKey = process.env.PAYWALLS_API_KEY;
    const origArgv = [...process.argv];
    beforeEach(() => { process.env.PAYWALLS_API_KEY = 'test-key'; });
    afterEach(() => {
      if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
      else delete process.env.PAYWALLS_API_KEY;
      process.argv = [...origArgv];
    });

    it('--headless output contains no ANSI escape codes', async () => {
      process.argv.push('--headless');
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 500000 },
      };

      await balance(['--headless']);
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n');
      expect(allOutput).not.toMatch(/\x1b/);
    });

    it('--json output contains no ANSI escape codes', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 500000 },
      };

      await balance(['--json']);
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n');
      expect(allOutput).not.toMatch(/\x1b/);
    });
  });
});
