/**
 * Receipts command — unit tests
 *
 * Tests the receipts command logic using mocked API responses.
 *
 * @see paywalls-site-3v5.3.4
 * @see src/cli/receipts.ts
 */

import { jest } from '@jest/globals';
import { ApiClient } from '../../src/api-client.js';

// ---------------------------------------------------------------------------
// Mock ApiClient
// ---------------------------------------------------------------------------

let mockGetResponses: Record<string, { ok: boolean; status: number; data: any }> = {};

jest.spyOn(ApiClient.prototype, 'get').mockImplementation(async (path: string) => {
  // Match paths that contain query strings
  const basePath = Object.keys(mockGetResponses).find((key) =>
    path === key || path.startsWith(key + '?') || path.startsWith(key + '/')
  );

  // Try exact match first, then prefix match
  const response = mockGetResponses[path] || (basePath ? mockGetResponses[basePath] : undefined);
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
// Shared fixtures
// ---------------------------------------------------------------------------

const meResponse = {
  ok: true,
  status: 200,
  data: {
    account_id: 'TEST-01-ACCOUNT',
    account_name: 'Test Account',
    user_id: 1,
    user_type: 'service-user',
  },
};

const sampleReceipts = [
  {
    publicId: 'REC-001',
    type: 'debit',
    amount: -1000,
    domain: 'example.com',
    url: 'https://example.com/article',
    created_at: '2026-02-22T14:30:05.000Z',
    status: 'settled',
  },
  {
    publicId: 'REC-002',
    type: 'credit',
    amount: 500000,
    domain: undefined,
    created_at: '2026-02-22T10:00:00.000Z',
    status: 'settled',
    description: 'Top-up',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('paywalls receipts', () => {
  let receipts: (args: string[]) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/cli/receipts.js');
    receipts = mod.receipts;
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
      await expect(receipts([])).rejects.toThrow('process.exit');
      expect(consoleErrors.join('\n')).toMatch(/Unable to authenticate/);
    });

    it('outputs JSON error when --json flag is set', async () => {
      await expect(receipts(['--json'])).rejects.toThrow('process.exit');
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

    it('shows empty state message when no receipts', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts'] = {
        ok: true,
        status: 200,
        data: { receipts: [], limit: 10, offset: 0 },
      };

      await receipts([]);
      expect(consoleOutput.join('\n')).toMatch(/No receipts yet/);
    });

    it('displays receipts in table format', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts'] = {
        ok: true,
        status: 200,
        data: { receipts: sampleReceipts, limit: 10, offset: 0, total: 2 },
      };

      await receipts([]);
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/Recent transactions/);
      expect(output).toMatch(/REC-001/);
      expect(output).toMatch(/REC-002/);
      expect(output).toMatch(/debit/);
      expect(output).toMatch(/credit/);
      expect(output).toMatch(/example\.com/);
    });

    it('outputs JSON list when --json flag is set', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts'] = {
        ok: true,
        status: 200,
        data: { receipts: sampleReceipts, limit: 10, offset: 0, total: 2 },
      };

      await receipts(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.receipts).toHaveLength(2);
      expect(output.receipts[0].amount_formatted).toBe('-$0.01');
      expect(output.receipts[1].amount_formatted).toBe('+$5.00');
      expect(output.total).toBe(2);
      expect(output.limit).toBe(10);
      expect(output.offset).toBe(0);
    });

    it('shows single receipt detail', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts/REC-001'] = {
        ok: true,
        status: 200,
        data: sampleReceipts[0],
      };

      await receipts(['REC-001']);
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/Receipt: REC-001/);
      expect(output).toMatch(/debit/);
      expect(output).toMatch(/-\$0\.01/);
      expect(output).toMatch(/example\.com/);
    });

    it('shows single receipt detail in JSON mode', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts/REC-001'] = {
        ok: true,
        status: 200,
        data: sampleReceipts[0],
      };

      await receipts(['REC-001', '--json']);
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.publicId).toBe('REC-001');
      expect(output.amount_formatted).toBe('-$0.01');
    });

    it('handles receipt not found', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts/NOPE'] = {
        ok: false,
        status: 404,
        data: { error: 'Receipt not found' },
      };

      await expect(receipts(['NOPE'])).rejects.toThrow('process.exit');
      expect(consoleErrors.join('\n')).toMatch(/Unable to retrieve receipt/);
    });

    it('handles invalid API key (401 from /api/me)', async () => {
      mockGetResponses['/api/me'] = {
        ok: false,
        status: 401,
        data: { error: 'Unauthorized' },
      };

      await expect(receipts([])).rejects.toThrow('process.exit');
      expect(consoleErrors.join('\n')).toMatch(/Unable to identify account/);
    });

    it('skips /api/me when accountId is known from config', async () => {
      process.env.PAYWALLS_ACCOUNT_ID = 'KNOWN-01-ACCOUNT';

      mockGetResponses['/api/wallet/KNOWN-01-ACCOUNT/receipts'] = {
        ok: true,
        status: 200,
        data: { receipts: [], limit: 10, offset: 0 },
      };

      await receipts([]);
      expect(consoleOutput.join('\n')).toMatch(/No receipts yet/);

      delete process.env.PAYWALLS_ACCOUNT_ID;
    });

    it('formats amounts correctly — positive and negative', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCOUNT/receipts'] = {
        ok: true,
        status: 200,
        data: {
          receipts: [
            { publicId: 'R1', type: 'debit', amount: -1000, created_at: '2026-01-01T00:00:00Z' },
            { publicId: 'R2', type: 'credit', amount: 500000, created_at: '2026-01-01T00:00:00Z' },
            { publicId: 'R3', type: 'debit', amount: 0, created_at: '2026-01-01T00:00:00Z' },
          ],
          limit: 10,
          offset: 0,
        },
      };

      await receipts(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.receipts[0].amount_formatted).toBe('-$0.01');
      expect(output.receipts[1].amount_formatted).toBe('+$5.00');
      expect(output.receipts[2].amount_formatted).toBe('+$0.00');
    });
  });
});
