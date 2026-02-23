/**
 * Balance command — unit tests
 *
 * Tests the balance command logic using mocked API responses.
 * Also tests the formatBalance helper and integration with config/output.
 *
 * @see paywalls-site-3v5.3.2
 * @see src/cli/balance.ts
 */

import { jest } from '@jest/globals';
import { ApiClient } from '../../src/api-client.js';

// ---------------------------------------------------------------------------
// Mock ApiClient to avoid real HTTP calls
// ---------------------------------------------------------------------------

let mockGetResponses: Record<string, { ok: boolean; status: number; data: any }> = {};

jest.spyOn(ApiClient.prototype, 'get').mockImplementation(async (path: string) => {
  const response = mockGetResponses[path];
  if (!response) {
    return { ok: false, status: 404, data: { error: 'Not found' } };
  }
  return response;
});

// Capture console output
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
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});

// Prevent process.exit from stopping test runner
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit');
}) as any);

afterAll(() => {
  mockExit.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('paywalls balance', () => {
  // Use dynamic import to get balance after mocks are set up
  let balance: (args: string[]) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/cli/balance.js');
    balance = mod.balance;
  });

  describe('no API key configured', () => {
    const originalApiKey = process.env.PAYWALLS_API_KEY;

    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = '';
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.PAYWALLS_API_KEY = originalApiKey;
      } else {
        delete process.env.PAYWALLS_API_KEY;
      }
    });

    it('exits with error when no API key is set', async () => {
      await expect(balance([])).rejects.toThrow('process.exit');
      expect(consoleErrors.join('\n')).toMatch(/Unable to authenticate/);
    });

    it('outputs JSON error when --json flag is set', async () => {
      await expect(balance(['--json'])).rejects.toThrow('process.exit');
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.error).toMatch(/Unable to authenticate/);
      expect(output.reason).toBeDefined();
      expect(output.resolution).toBeDefined();
    });
  });

  describe('with API key configured', () => {
    const originalApiKey = process.env.PAYWALLS_API_KEY;

    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = 'test-key-123';
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env.PAYWALLS_API_KEY = originalApiKey;
      } else {
        delete process.env.PAYWALLS_API_KEY;
      }
    });

    it('shows balance when API returns success', async () => {
      mockGetResponses['/api/me'] = {
        ok: true,
        status: 200,
        data: {
          account_id: 'TEST-01-ACCOUNT',
          account_name: 'Test Account',
          user_id: 1,
          user_type: 'service-user',
        },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/balance'] = {
        ok: true,
        status: 200,
        data: { balance: 500000 },
      };

      await balance([]);
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/\$5\.00/);
      expect(output).toMatch(/TEST-01-ACCOUNT/);
      expect(output).toMatch(/500,000|500000/);
    });

    it('outputs JSON when --json flag is set', async () => {
      mockGetResponses['/api/me'] = {
        ok: true,
        status: 200,
        data: {
          account_id: 'TEST-01-ACCOUNT',
          account_name: 'Test Account',
          user_id: 1,
          user_type: 'service-user',
        },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/balance'] = {
        ok: true,
        status: 200,
        data: { balance: 150000 },
      };

      await balance(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.account_id).toBe('TEST-01-ACCOUNT');
      expect(output.balance).toBe(150000);
      expect(output.balance_formatted).toBe('$1.50');
      expect(output.currency).toBe('USD');
    });

    it('handles invalid API key (401 from /api/me)', async () => {
      mockGetResponses['/api/me'] = {
        ok: false,
        status: 401,
        data: { error: 'Unauthorized' },
      };

      await expect(balance([])).rejects.toThrow('process.exit');
      expect(consoleErrors.join('\n')).toMatch(/Unable to identify account/);
    });

    it('handles no wallet found (404 from balance)', async () => {
      mockGetResponses['/api/me'] = {
        ok: true,
        status: 200,
        data: {
          account_id: 'TEST-01-ACCOUNT',
          account_name: 'Test Account',
          user_id: 1,
          user_type: 'service-user',
        },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/balance'] = {
        ok: false,
        status: 404,
        data: { error: 'Wallet not found' },
      };

      await expect(balance([])).rejects.toThrow('process.exit');
      expect(consoleErrors.join('\n')).toMatch(/Unable to retrieve balance/);
    });

    it('skips /api/me when accountId is already known from config', async () => {
      process.env.PAYWALLS_ACCOUNT_ID = 'KNOWN-01-ACCOUNT';

      mockGetResponses['/api/wallet/KNOWN-01-ACCOUNT/balance'] = {
        ok: true,
        status: 200,
        data: { balance: 0 },
      };

      await balance([]);
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/\$0\.00/);
      expect(output).toMatch(/KNOWN-01-ACCOUNT/);

      delete process.env.PAYWALLS_ACCOUNT_ID;
    });

    it('formats zero balance correctly', async () => {
      mockGetResponses['/api/me'] = {
        ok: true,
        status: 200,
        data: {
          account_id: 'TEST-01-ACCOUNT',
          account_name: 'Test',
          user_id: 1,
          user_type: 'user',
        },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/balance'] = {
        ok: true,
        status: 200,
        data: { balance: 0 },
      };

      await balance([]);
      expect(consoleOutput.join('\n')).toMatch(/\$0\.00/);
    });
  });
});
