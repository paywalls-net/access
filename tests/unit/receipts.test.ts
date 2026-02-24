/**
 * Receipts command — unit tests
 *
 * Structure:
 *  1. Pure function tests (formatAmount, formatDate, receiptId, padRow)
 *  2. API orchestration (correct URLs called, params built from flags)
 *  3. Output structure (JSON shape, ERR shape)
 *
 * @see paywalls-site-3v5.3.4
 * @see src/cli/receipts.ts
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
const {
  formatAmount,
  formatDate,
  receiptId,
  padRow,
} = await import('../../src/cli/receipts.js');

// ---------------------------------------------------------------------------
// 1. Pure function tests — no mocks needed
// ---------------------------------------------------------------------------

describe('formatAmount', () => {
  it('formats negative millicents as -$X.XX', () => {
    expect(formatAmount(-1000)).toBe('-$0.01');
    expect(formatAmount(-100000)).toBe('-$1.00');
  });

  it('formats positive millicents as +$X.XX', () => {
    expect(formatAmount(500000)).toBe('+$5.00');
    expect(formatAmount(1)).toBe('+$0.00');
  });

  it('formats zero as +$0.00', () => {
    expect(formatAmount(0)).toBe('+$0.00');
  });

  it('handles large values', () => {
    expect(formatAmount(999_999_999)).toBe('+$10000.00');
  });
});

describe('formatDate', () => {
  it('returns dash for undefined/empty', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('returns a formatted string for valid ISO dates', () => {
    const result = formatDate('2026-02-22T14:30:05.000Z');
    // Should contain month abbreviation and time — locale-dependent but structured
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(5);
  });

  it('does not throw on unparseable input', () => {
    expect(() => formatDate('garbage')).not.toThrow();
  });
});

describe('receiptId', () => {
  it('prefers publicId', () => {
    expect(receiptId({ publicId: 'REC-001', id: '42' })).toBe('REC-001');
  });

  it('falls back to id', () => {
    expect(receiptId({ id: '42' })).toBe('42');
    expect(receiptId({ id: 99 })).toBe('99');
  });

  it('returns dash when neither present', () => {
    expect(receiptId({})).toBe('—');
  });
});

describe('padRow', () => {
  it('aligns columns to fixed widths', () => {
    const row1 = padRow('Jan 01', 'debit', '-$0.01', 'example.com', 'REC-001');
    const row2 = padRow('Feb 22, 14:30', 'credit', '+$5.00', 'x.co', 'REC-002');
    // Receipt column starts at the same position regardless of content width
    expect(row1.indexOf('REC-001')).toBe(row2.indexOf('REC-002'));
  });
});

// ---------------------------------------------------------------------------
// 2–3. Integration tests — API orchestration + output structure
// ---------------------------------------------------------------------------

let mockGet: jest.SpiedFunction<typeof ApiClient.prototype.get>;
let mockGetResponses: Record<string, { ok: boolean; status: number; data: any }>;

mockGet = jest.spyOn(ApiClient.prototype, 'get').mockImplementation(async (path: string) => {
  const basePath = Object.keys(mockGetResponses).find((key) =>
    path === key || path.startsWith(key + '?') || path.startsWith(key + '/')
  );
  const response = mockGetResponses[path] || (basePath ? mockGetResponses[basePath] : undefined);
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

// Shared fixtures
const meResponse = {
  ok: true, status: 200,
  data: { account_id: 'TEST-01-ACCT', account_name: 'Test', user_id: 1, user_type: 'service-user' },
};

const sampleReceipts = [
  { publicId: 'REC-001', type: 'debit', amount: -1000, domain: 'example.com',
    url: 'https://example.com/article', created_at: '2026-02-22T14:30:05.000Z', status: 'settled' },
  { publicId: 'REC-002', type: 'credit', amount: 500000,
    created_at: '2026-02-22T10:00:00.000Z', status: 'settled', description: 'Top-up' },
];

describe('paywalls receipts', () => {
  let receipts: (args: string[]) => Promise<void>;
  beforeAll(async () => {
    const mod = await import('../../src/cli/receipts.js');
    receipts = mod.receipts;
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
      await expect(receipts(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output).toHaveProperty('reason');
      expect(output).toHaveProperty('resolution');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits(1) with ERR including HTTP status when /api/me fails', async () => {
      process.env.PAYWALLS_API_KEY = 'bad-key';
      mockGetResponses['/api/me'] = { ok: false, status: 401, data: { error: 'Unauthorized' } };

      await expect(receipts(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output).toHaveProperty('reason');
      expect(output.reason).toMatch(/401/);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits(1) with ERR including receipt ID when not found', async () => {
      process.env.PAYWALLS_API_KEY = 'test-key';
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts/NOPE'] = {
        ok: false, status: 404, data: { error: 'Not found' },
      };

      await expect(receipts(['NOPE', '--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output).toHaveProperty('error');
      expect(output.reason).toMatch(/NOPE/);
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

    it('calls /api/me first, then /api/wallet/:id/receipts', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts'] = {
        ok: true, status: 200, data: { receipts: [], limit: 10, offset: 0 },
      };

      await receipts([]);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls[0]).toBe('/api/me');
      expect(calls[1]).toMatch(/^\/api\/wallet\/TEST-01-ACCT\/receipts/);
    });

    it('skips /api/me when PAYWALLS_ACCOUNT_ID is set', async () => {
      process.env.PAYWALLS_ACCOUNT_ID = 'KNOWN-ACCT';
      mockGetResponses['/api/wallet/KNOWN-ACCT/receipts'] = {
        ok: true, status: 200, data: { receipts: [], limit: 10, offset: 0 },
      };

      await receipts([]);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls[0]).toMatch(/^\/api\/wallet\/KNOWN-ACCT\/receipts/);
      expect(calls.some(c => c === '/api/me')).toBe(false);
    });

    it('routes receipt ID arg to detail endpoint', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts/REC-001'] = {
        ok: true, status: 200, data: sampleReceipts[0],
      };

      await receipts(['REC-001', '--json']);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls).toContainEqual('/api/wallet/TEST-01-ACCT/receipts/REC-001');
    });

    it('passes --limit, --offset, --type, --domain as query params', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts'] = {
        ok: true, status: 200, data: { receipts: [], limit: 5, offset: 10 },
      };

      await receipts(['--limit=5', '--offset=10', '--type=debit', '--domain=example.com']);

      const url = mockGet.mock.calls.find(c => (c[0] as string).includes('/receipts'))![0] as string;
      expect(url).toMatch(/limit=5/);
      expect(url).toMatch(/offset=10/);
      expect(url).toMatch(/type=debit/);
      expect(url).toMatch(/domain=example\.com/);
    });

    it('clamps --limit to 100 max', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts'] = {
        ok: true, status: 200, data: { receipts: [], limit: 100, offset: 0 },
      };

      await receipts(['--limit=999']);

      const url = mockGet.mock.calls.find(c => (c[0] as string).includes('/receipts'))![0] as string;
      expect(url).toMatch(/limit=100/);
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

    it('list response has receipts[], total, limit, offset + computed amount_formatted', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts'] = {
        ok: true, status: 200,
        data: { receipts: sampleReceipts, limit: 10, offset: 0, total: 2 },
      };

      await receipts(['--json']);
      const output = JSON.parse(consoleOutput.join(''));

      expect(output).toHaveProperty('receipts');
      expect(output).toHaveProperty('total', 2);
      expect(output).toHaveProperty('limit', 10);
      expect(output).toHaveProperty('offset', 0);
      expect(output.receipts).toHaveLength(2);
      // amount_formatted is computed by our code, not mock passthrough
      expect(output.receipts[0].amount_formatted).toBe(formatAmount(sampleReceipts[0].amount));
      expect(output.receipts[1].amount_formatted).toBe(formatAmount(sampleReceipts[1].amount));
    });

    it('detail response adds amount_formatted to receipt', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts/REC-001'] = {
        ok: true, status: 200, data: sampleReceipts[0],
      };

      await receipts(['REC-001', '--json']);
      const output = JSON.parse(consoleOutput.join(''));

      expect(output.publicId).toBe('REC-001');
      expect(output.amount_formatted).toBe(formatAmount(sampleReceipts[0].amount));
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

    it('--headless list output contains no ANSI escape codes', async () => {
      process.argv.push('--headless');
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts'] = {
        ok: true, status: 200,
        data: { receipts: sampleReceipts, limit: 10, offset: 0, total: 2 },
      };

      await receipts(['--headless']);
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n');
      expect(allOutput).not.toMatch(/\x1b/);
    });

    it('--json output contains no ANSI escape codes', async () => {
      mockGetResponses['/api/me'] = meResponse;
      mockGetResponses['/api/wallet/TEST-01-ACCT/receipts'] = {
        ok: true, status: 200,
        data: { receipts: sampleReceipts, limit: 10, offset: 0, total: 2 },
      };

      await receipts(['--json']);
      const allOutput = [...consoleOutput, ...consoleErrors].join('\n');
      expect(allOutput).not.toMatch(/\x1b/);
    });
  });
});
