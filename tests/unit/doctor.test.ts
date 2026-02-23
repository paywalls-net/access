/**
 * Doctor command — unit tests
 *
 * Structure:
 *  1. Pure function tests (detectApiKeySource, checkConfiguration)
 *  2. Individual check tests (connectivity, authentication, wallet, agent)
 *  3. Orchestration (all checks run, JSON output, exit codes)
 *
 * @see paywalls-site-3v5.3.5
 * @see src/cli/doctor.ts
 */

import { jest } from '@jest/globals';
import { ApiClient } from '../../src/api-client.js';
import {
  checkConfiguration,
  checkConnectivity,
  checkAuthentication,
  checkWallet,
  checkAgent,
  detectApiKeySource,
} from '../../src/cli/doctor.js';

// ---------------------------------------------------------------------------
// 1. Pure function tests — no mocks needed
// ---------------------------------------------------------------------------

describe('detectApiKeySource', () => {
  const origKey = process.env.PAYWALLS_API_KEY;
  afterEach(() => {
    if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
    else delete process.env.PAYWALLS_API_KEY;
  });

  it('returns "environment" when PAYWALLS_API_KEY is set', () => {
    process.env.PAYWALLS_API_KEY = 'some-key';
    expect(detectApiKeySource()).toBe('environment');
  });

  it('returns "credentials_file" when env var is not set', () => {
    delete process.env.PAYWALLS_API_KEY;
    expect(detectApiKeySource()).toBe('credentials_file');
  });
});

describe('checkConfiguration', () => {
  const origKey = process.env.PAYWALLS_API_KEY;
  afterEach(() => {
    if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
    else delete process.env.PAYWALLS_API_KEY;
  });

  it('returns pass when API key present', () => {
    process.env.PAYWALLS_API_KEY = 'TEST-KEY-123';
    const result = checkConfiguration();
    expect(result.status).toBe('pass');
    expect(result.name).toBe('configuration');
    expect(result.details?.api_key_source).toBe('environment');
    expect(result.details?.base_url).toBeDefined();
  });

  it('returns fail with fix when no API key', () => {
    process.env.PAYWALLS_API_KEY = '';
    const result = checkConfiguration();
    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/No API key/i);
    expect(result.fix).toBeDefined();
  });

  it('includes key prefix in details (not full key)', () => {
    process.env.PAYWALLS_API_KEY = 'FL0QCW-01-MLYIB66U';
    const result = checkConfiguration();
    expect(result.details?.api_key_prefix).toBe('FL0QCW-0…');
    // Not the full key
    expect(result.details?.api_key_prefix).not.toBe('FL0QCW-01-MLYIB66U');
  });
});

// ---------------------------------------------------------------------------
// 2. Individual check tests — with API mock
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
const originalWarn = console.warn;

beforeEach(() => {
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args: any[]) => consoleOutput.push(args.join(' '));
  console.error = (...args: any[]) => consoleErrors.push(args.join(' '));
  console.warn = (...args: any[]) => consoleErrors.push(args.join(' '));
  mockGetResponses = {};
  mockGet.mockClear();
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
});

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit');
}) as any);
afterAll(() => mockExit.mockRestore());

describe('checkConnectivity', () => {
  it('returns pass with latency when API responds', async () => {
    mockGetResponses['/api/health'] = { ok: true, status: 200, data: {} };
    const client = new ApiClient();
    const result = await checkConnectivity(client);

    expect(result.status).toBe('pass');
    expect(result.name).toBe('connectivity');
    expect(result.details?.latency_ms).toBeDefined();
    expect(typeof result.details?.latency_ms).toBe('number');
  });

  it('returns pass even on non-2xx response (server is reachable)', async () => {
    mockGetResponses['/api/health'] = { ok: false, status: 401, data: { error: 'Unauthorized' } };
    const client = new ApiClient();
    const result = await checkConnectivity(client);

    expect(result.status).toBe('pass');
    expect(result.details?.status).toBe(401);
  });

  it('returns fail when fetch throws (network error)', async () => {
    mockGet.mockImplementationOnce(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new ApiClient();
    const result = await checkConnectivity(client);

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/Cannot reach/);
    expect(result.fix).toBeDefined();
  });
});

describe('checkAuthentication', () => {
  it('returns pass with account details on 200', async () => {
    mockGetResponses['/api/me'] = {
      ok: true, status: 200,
      data: { account_id: 'TEST-01-ACCT', account_name: 'Test Account', status: 'active' },
    };
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkAuthentication(client);

    expect(result.status).toBe('pass');
    expect(result.details?.account_id).toBe('TEST-01-ACCT');
    expect(result.details?.account_name).toBe('Test Account');
  });

  it('returns fail with HTTP status on auth failure', async () => {
    mockGetResponses['/api/me'] = { ok: false, status: 401, data: { error: 'Unauthorized' } };
    const client = new ApiClient({ apiKey: 'bad-key' });
    const result = await checkAuthentication(client);

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/401/);
    expect(result.fix).toBeDefined();
  });

  it('returns fail when no API key configured', async () => {
    const client = new ApiClient({ apiKey: '' });
    // Override apiKey getter for this test
    Object.defineProperty(client, 'apiKey', { get: () => '' });
    const result = await checkAuthentication(client);

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/no API key/i);
  });
});

describe('checkWallet', () => {
  it('returns pass with balance details', async () => {
    mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
      ok: true, status: 200, data: { balance: 500000, status: 'active' },
    };
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkWallet(client, 'TEST-01-ACCT');

    expect(result.status).toBe('pass');
    expect(result.details?.balance).toBe(500000);
    expect(result.details?.balance_formatted).toBe('$5.00');
    expect(result.details?.status).toBe('active');
  });

  it('returns fail on 404 (no wallet)', async () => {
    mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
      ok: false, status: 404, data: { error: 'Not found' },
    };
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkWallet(client, 'TEST-01-ACCT');

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/No wallet/);
    expect(result.error).toMatch(/TEST-01-ACCT/);
    expect(result.fix).toMatch(/topup/);
  });

  it('returns fail when no account ID', async () => {
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkWallet(client, undefined);

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/account could not be resolved/i);
  });
});

describe('checkAgent', () => {
  it('returns pass when agents exist', async () => {
    mockGetResponses['/api/account/TEST-01-ACCT/agents'] = {
      ok: true, status: 200,
      data: { agents: [{ id: 'agent-1', name: 'my-agent' }] },
    };
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkAgent(client, 'TEST-01-ACCT');

    expect(result.status).toBe('pass');
    expect(result.details?.count).toBe(1);
  });

  it('returns fail when no agents registered', async () => {
    mockGetResponses['/api/account/TEST-01-ACCT/agents'] = {
      ok: true, status: 200, data: { agents: [] },
    };
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkAgent(client, 'TEST-01-ACCT');

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/No agents/);
    expect(result.fix).toMatch(/register/);
  });

  it('returns fail when no account ID', async () => {
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkAgent(client, undefined);

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/account could not be resolved/i);
  });

  it('returns fail on API error', async () => {
    mockGetResponses['/api/account/TEST-01-ACCT/agents'] = {
      ok: false, status: 500, data: { error: 'Internal error' },
    };
    const client = new ApiClient({ apiKey: 'test-key' });
    const result = await checkAgent(client, 'TEST-01-ACCT');

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/500/);
  });
});

// ---------------------------------------------------------------------------
// 3. Orchestration — full doctor command
// ---------------------------------------------------------------------------

describe('paywalls doctor', () => {
  let doctor: (args: string[]) => Promise<void>;
  beforeAll(async () => {
    const mod = await import('../../src/cli/doctor.js');
    doctor = mod.doctor;
  });

  const origKey = process.env.PAYWALLS_API_KEY;
  const origAcctId = process.env.PAYWALLS_ACCOUNT_ID;
  afterEach(() => {
    if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
    else delete process.env.PAYWALLS_API_KEY;
    if (origAcctId !== undefined) process.env.PAYWALLS_ACCOUNT_ID = origAcctId;
    else delete process.env.PAYWALLS_ACCOUNT_ID;
  });

  // ---- All checks pass ----

  describe('all checks pass', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = 'test-key';
      mockGetResponses['/api/health'] = { ok: true, status: 200, data: {} };
      mockGetResponses['/api/me'] = {
        ok: true, status: 200,
        data: { account_id: 'TEST-01-ACCT', account_name: 'Test', status: 'active' },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 500000, status: 'active' },
      };
      mockGetResponses['/api/account/TEST-01-ACCT/agents'] = {
        ok: true, status: 200,
        data: { agents: [{ id: 'a1', name: 'my-agent' }] },
      };
    });

    it('outputs JSON with all 5 checks and 5/5 passed', async () => {
      await doctor(['--json']);
      const output = JSON.parse(consoleOutput.join(''));

      expect(output.total).toBe(5);
      expect(output.passed).toBe(5);
      expect(output.checks).toHaveLength(5);
      expect(output.checks.every((c: any) => c.status === 'pass')).toBe(true);
    });

    it('does not exit(1) when all pass', async () => {
      mockExit.mockClear();
      await doctor(['--json']);
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('check names are configuration, connectivity, authentication, wallet, agent', async () => {
      await doctor(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      const names = output.checks.map((c: any) => c.name);
      expect(names).toEqual([
        'configuration',
        'connectivity',
        'authentication',
        'wallet',
        'agent',
      ]);
    });

    it('human-readable output includes header and pass count', async () => {
      await doctor([]);
      const combined = consoleOutput.join('\n');
      expect(combined).toMatch(/Paywalls Developer Environment Check/);
      expect(combined).toMatch(/5\/5 checks passed/);
    });
  });

  // ---- Partial failures ----

  describe('partial failures', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = 'test-key';
      mockGetResponses['/api/health'] = { ok: true, status: 200, data: {} };
      mockGetResponses['/api/me'] = {
        ok: true, status: 200,
        data: { account_id: 'TEST-01-ACCT', account_name: 'Test', status: 'active' },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 500000, status: 'active' },
      };
      // Agent check fails
      mockGetResponses['/api/account/TEST-01-ACCT/agents'] = {
        ok: true, status: 200, data: { agents: [] },
      };
    });

    it('reports 4/5 passed with agent failure', async () => {
      await expect(doctor(['--json'])).rejects.toThrow('process.exit');
      const output = JSON.parse(consoleOutput.join(''));

      expect(output.passed).toBe(4);
      expect(output.total).toBe(5);
      expect(output.checks[4].name).toBe('agent');
      expect(output.checks[4].status).toBe('fail');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('failed check includes error and fix in JSON', async () => {
      await expect(doctor(['--json'])).rejects.toThrow('process.exit');
      const output = JSON.parse(consoleOutput.join(''));
      const agentCheck = output.checks.find((c: any) => c.name === 'agent');

      expect(agentCheck.error).toBeDefined();
      expect(agentCheck.fix).toBeDefined();
    });
  });

  // ---- No credentials ----

  describe('no credentials', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = '';
      mockGetResponses['/api/health'] = { ok: true, status: 200, data: {} };
    });

    it('continues all checks even without API key', async () => {
      await expect(doctor(['--json'])).rejects.toThrow('process.exit');
      const output = JSON.parse(consoleOutput.join(''));

      // All 5 checks ran
      expect(output.total).toBe(5);
      // config fail, connectivity pass, auth fail, wallet fail, agent fail
      expect(output.checks[0].status).toBe('fail'); // configuration
      expect(output.checks[1].status).toBe('pass'); // connectivity
      expect(output.checks[2].status).toBe('fail'); // authentication
      expect(output.checks[3].status).toBe('fail'); // wallet
      expect(output.checks[4].status).toBe('fail'); // agent
      expect(output.passed).toBe(1);
    });
  });

  // ---- API orchestration ----

  describe('API orchestration', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = 'test-key';
      mockGetResponses['/api/health'] = { ok: true, status: 200, data: {} };
      mockGetResponses['/api/me'] = {
        ok: true, status: 200,
        data: { account_id: 'RESOLVED-ACCT', account_name: 'Test', status: 'active' },
      };
      mockGetResponses['/api/wallet/RESOLVED-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 100000 },
      };
      mockGetResponses['/api/account/RESOLVED-ACCT/agents'] = {
        ok: true, status: 200,
        data: { agents: [{ id: 'a1', name: 'bot' }] },
      };
    });

    it('uses account_id from /api/me for wallet and agent checks', async () => {
      await doctor(['--json']);

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls).toContain('/api/health');
      expect(calls).toContain('/api/me');
      expect(calls).toContain('/api/wallet/RESOLVED-ACCT/balance');
      expect(calls).toContain('/api/account/RESOLVED-ACCT/agents');
    });

    it('uses PAYWALLS_ACCOUNT_ID when /api/me fails', async () => {
      process.env.PAYWALLS_ACCOUNT_ID = 'ENV-ACCT';
      mockGetResponses['/api/me'] = { ok: false, status: 401, data: { error: 'Unauthorized' } };
      mockGetResponses['/api/wallet/ENV-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 0 },
      };
      mockGetResponses['/api/account/ENV-ACCT/agents'] = {
        ok: true, status: 200, data: { agents: [] },
      };

      await expect(doctor(['--json'])).rejects.toThrow('process.exit');

      const calls = mockGet.mock.calls.map(c => c[0]);
      expect(calls).toContain('/api/wallet/ENV-ACCT/balance');
      expect(calls).toContain('/api/account/ENV-ACCT/agents');
    });
  });

  // ---- JSON output structure ----

  describe('JSON output structure', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = 'test-key';
      mockGetResponses['/api/health'] = { ok: true, status: 200, data: {} };
      mockGetResponses['/api/me'] = {
        ok: true, status: 200,
        data: { account_id: 'TEST-01-ACCT', account_name: 'Test', status: 'active' },
      };
      mockGetResponses['/api/wallet/TEST-01-ACCT/balance'] = {
        ok: true, status: 200, data: { balance: 250000 },
      };
      mockGetResponses['/api/account/TEST-01-ACCT/agents'] = {
        ok: true, status: 200,
        data: { agents: [{ id: 'a1', name: 'my-agent' }] },
      };
    });

    it('has checks[], passed, total at top level', async () => {
      await doctor(['--json']);
      const output = JSON.parse(consoleOutput.join(''));

      expect(output).toHaveProperty('checks');
      expect(output).toHaveProperty('passed');
      expect(output).toHaveProperty('total');
      expect(Array.isArray(output.checks)).toBe(true);
    });

    it('each check has name and status', async () => {
      await doctor(['--json']);
      const output = JSON.parse(consoleOutput.join(''));

      for (const check of output.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('status');
        expect(['pass', 'fail']).toContain(check.status);
      }
    });

    it('connectivity check includes latency_ms', async () => {
      await doctor(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      const conn = output.checks.find((c: any) => c.name === 'connectivity');

      expect(conn.details.latency_ms).toBeDefined();
      expect(typeof conn.details.latency_ms).toBe('number');
    });

    it('wallet check includes balance and balance_formatted', async () => {
      await doctor(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      const wallet = output.checks.find((c: any) => c.name === 'wallet');

      expect(wallet.details.balance).toBe(250000);
      expect(wallet.details.balance_formatted).toBe('$2.50');
    });
  });
});
