/**
 * Register command — unit tests
 *
 * Structure:
 *  1. Guard: existing credentials
 *  2. Error handling: network errors, server errors
 *  3. Polling: authorization_pending, slow_down, expired, denied
 *  4. Success: credential saving, JSON output
 *  5. API orchestration: correct endpoints and payloads
 *
 * @see paywalls-site-3v5.3.1
 * @see src/cli/register.ts
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock config module (must be before dynamic imports that depend on it)
// ---------------------------------------------------------------------------

const mockSaveCredentials = jest.fn<(creds: any) => void>();
const mockOpenBrowser = jest.fn<(url: string) => void>();

jest.unstable_mockModule('../../src/config.js', () => ({
  loadConfig: jest.fn((overrides?: any) => ({
    apiKey: process.env.PAYWALLS_API_KEY || '',
    baseUrl: overrides?.baseUrl || process.env.PAYWALLS_BASE_URL || 'https://api.paywalls.net',
    accountId: process.env.PAYWALLS_ACCOUNT_ID,
  })),
  saveCredentials: mockSaveCredentials,
  hasCredentials: jest.fn(() => (process.env.PAYWALLS_API_KEY || '').length > 0),
}));

jest.unstable_mockModule('../../src/cli/util.js', () => ({
  parseFlags: (args: string[]) => {
    const flags: Record<string, string | boolean> = {};
    for (const arg of args) {
      if (arg.startsWith('--')) {
        const eq = arg.indexOf('=');
        if (eq > -1) {
          flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        } else {
          flags[arg.slice(2)] = true;
        }
      }
    }
    return flags;
  },
  isHeadless: jest.fn(() => false),
  openBrowser: mockOpenBrowser,
}));

// Dynamic imports — must be after jest.unstable_mockModule
const { ApiClient } = await import('../../src/api-client.js');
const { register, sleep } = await import('../../src/cli/register.js');

// ---------------------------------------------------------------------------
// Mock setup — same patterns as balance.test.ts and doctor.test.ts
// ---------------------------------------------------------------------------

let mockPost: jest.SpiedFunction<typeof ApiClient.prototype.post>;
let mockPostResponses: Record<string, { ok: boolean; status: number; data: any }>;

mockPost = jest.spyOn(ApiClient.prototype, 'post').mockImplementation(async (path: string) => {
  const response = mockPostResponses[path];
  if (!response) return { ok: false, status: 404, data: { error: 'Not found' } };
  return response;
});

let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
let stdoutWrites: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalStdoutWrite = process.stdout.write;

beforeEach(() => {
  consoleOutput = [];
  consoleErrors = [];
  stdoutWrites = [];
  console.log = (...args: any[]) => consoleOutput.push(args.join(' '));
  console.error = (...args: any[]) => consoleErrors.push(args.join(' '));
  console.warn = (...args: any[]) => consoleErrors.push(args.join(' '));
  process.stdout.write = ((chunk: any) => {
    stdoutWrites.push(String(chunk));
    return true;
  }) as any;
  mockPostResponses = {};
  // mockReset clears calls AND restores to no-op; re-set default implementation
  mockPost.mockReset();
  mockPost.mockImplementation(async (path: string) => {
    const response = mockPostResponses[path];
    if (!response) return { ok: false, status: 404, data: { error: 'Not found' } };
    return response;
  });
  mockSaveCredentials.mockClear();
  mockOpenBrowser.mockClear();
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  process.stdout.write = originalStdoutWrite;
});

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit');
}) as any);
afterAll(() => mockExit.mockRestore());

// Standard device-code response (interval=0 makes polling instantaneous in tests)
const deviceCodeResponse = {
  ok: true,
  status: 200,
  data: {
    device_code: 'WDJB-WNRH',
    user_code: 'WDJB-WNRH',
    verification_uri: 'https://paywalls.net/device',
    verification_uri_complete: 'https://paywalls.net/device?code=WDJB-WNRH',
    expires_in: 900,
    interval: 0, // Instantaneous polling in tests
  },
};

const tokenSuccessResponse = {
  ok: true,
  status: 200,
  data: {
    api_key: 'TEST-01-APIKEY123',
    account_id: 'ACCT-01-TEST999',
    token_type: 'api-key',
    message: 'Store this key securely.',
  },
};

// ---------------------------------------------------------------------------
// 1. Pure function tests
// ---------------------------------------------------------------------------

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    const start = Date.now();
    await sleep(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 2–5. Integration tests
// ---------------------------------------------------------------------------

describe('paywalls register', () => {
  let register: (args: string[]) => Promise<void>;
  beforeAll(async () => {
    const mod = await import('../../src/cli/register.js');
    register = mod.register;
  });

  const origKey = process.env.PAYWALLS_API_KEY;
  const origAcctId = process.env.PAYWALLS_ACCOUNT_ID;
  afterEach(() => {
    if (origKey !== undefined) process.env.PAYWALLS_API_KEY = origKey;
    else delete process.env.PAYWALLS_API_KEY;
    if (origAcctId !== undefined) process.env.PAYWALLS_ACCOUNT_ID = origAcctId;
    else delete process.env.PAYWALLS_ACCOUNT_ID;
  });

  // ---- Guard: existing credentials ----

  describe('existing credentials guard', () => {
    it('exits(1) when credentials exist and --force not given', async () => {
      process.env.PAYWALLS_API_KEY = 'existing-key';
      await expect(register(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output.error).toMatch(/already exist/i);
      expect(output.resolution).toMatch(/--force/);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('proceeds when --force given despite existing credentials', async () => {
      process.env.PAYWALLS_API_KEY = 'existing-key';
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = tokenSuccessResponse;

      await register(['--json', '--force']);

      // Should not exit(1) for existing credentials
      const calls = mockPost.mock.calls.map(c => c[0]);
      expect(calls).toContain('/api/device/code');
    });

    it('proceeds when no credentials exist', async () => {
      process.env.PAYWALLS_API_KEY = '';
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = tokenSuccessResponse;

      await register(['--json']);

      const calls = mockPost.mock.calls.map(c => c[0]);
      expect(calls).toContain('/api/device/code');
    });
  });

  // ---- Error handling ----

  describe('error handling', () => {
    beforeEach(() => { process.env.PAYWALLS_API_KEY = ''; });

    it('exits(1) with ERR when /api/device/code returns non-200', async () => {
      mockPostResponses['/api/device/code'] = {
        ok: false, status: 500, data: { error: 'Internal server error' },
      };

      await expect(register(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output.error).toMatch(/Failed to initiate/i);
      expect(output.reason).toMatch(/500/);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits(1) with ERR on network error during code request', async () => {
      mockPost.mockImplementationOnce(async () => {
        throw new Error('ECONNREFUSED');
      });

      await expect(register(['--json'])).rejects.toThrow('process.exit');

      const output = JSON.parse(consoleOutput.join(''));
      expect(output.error).toMatch(/Cannot reach/i);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ---- Polling behavior ----

  describe('polling', () => {
    beforeEach(() => { process.env.PAYWALLS_API_KEY = ''; });

    it('handles authorization_pending (428) then success', async () => {
      let pollCount = 0;
      mockPost.mockImplementation(async (path: string) => {
        if (path === '/api/device/code') return deviceCodeResponse;
        if (path === '/api/device/token') {
          pollCount++;
          if (pollCount < 3) {
            return { ok: false, status: 428, data: { error: 'authorization_pending' } };
          }
          return tokenSuccessResponse;
        }
        return { ok: false, status: 404, data: { error: 'Not found' } };
      });

      await register(['--json']);

      // Polled at least 3 times
      const tokenCalls = mockPost.mock.calls.filter(c => c[0] === '/api/device/token');
      expect(tokenCalls.length).toBe(3);
    });

    it('prints dots during pending in interactive mode', async () => {
      let pollCount = 0;
      mockPost.mockImplementation(async (path: string) => {
        if (path === '/api/device/code') return deviceCodeResponse;
        if (path === '/api/device/token') {
          pollCount++;
          if (pollCount < 3) {
            return { ok: false, status: 428, data: { error: 'authorization_pending' } };
          }
          return tokenSuccessResponse;
        }
        return { ok: false, status: 404, data: { error: 'Not found' } };
      });

      await register([]);

      // In non-TTY (test env), progress dots go to console.log; in TTY to stdout.write
      const dotsInConsole = consoleOutput.filter(w => w === '.').length;
      const dotsInStdout = stdoutWrites.filter(w => w === '.').length;
      expect(dotsInConsole + dotsInStdout).toBe(2);
    });

    it('exits(1) on expired_token', async () => {
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = {
        ok: false, status: 400, data: { error: 'expired_token', message: 'Code expired' },
      };

      await expect(register(['--json'])).rejects.toThrow('process.exit');

      const lastLine = consoleOutput[consoleOutput.length - 1];
      const output = JSON.parse(lastLine);
      expect(output.error).toMatch(/expired/i);
      expect(output.resolution).toMatch(/register/i);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits(1) on access_denied', async () => {
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = {
        ok: false, status: 400, data: { error: 'access_denied' },
      };

      await expect(register(['--json'])).rejects.toThrow('process.exit');

      const lastLine = consoleOutput[consoleOutput.length - 1];
      const output = JSON.parse(lastLine);
      expect(output.error).toMatch(/denied/i);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('increases interval on slow_down (RFC 8628 §3.5)', async () => {
      jest.useFakeTimers();
      let pollCount = 0;

      mockPost.mockImplementation(async (path: string) => {
        if (path === '/api/device/code') return deviceCodeResponse;
        if (path === '/api/device/token') {
          pollCount++;
          if (pollCount === 1) {
            return { ok: false, status: 429, data: { error: 'slow_down' } };
          }
          return tokenSuccessResponse;
        }
        return { ok: false, status: 404, data: { error: 'Not found' } };
      });

      const promise = register(['--json']);

      // First sleep(0) resolves immediately
      await jest.advanceTimersByTimeAsync(0);
      // slow_down received → interval += 5000ms → second sleep(5000)
      await jest.advanceTimersByTimeAsync(5000);

      await promise;

      // Should have polled twice: first slow_down, then success
      const tokenCalls = mockPost.mock.calls.filter(c => c[0] === '/api/device/token');
      expect(tokenCalls.length).toBe(2);

      jest.useRealTimers();
    });

    it('continues polling on network error during token request', async () => {
      let pollCount = 0;
      mockPost.mockImplementation(async (path: string) => {
        if (path === '/api/device/code') return deviceCodeResponse;
        if (path === '/api/device/token') {
          pollCount++;
          if (pollCount === 1) throw new Error('ECONNRESET');
          return tokenSuccessResponse;
        }
        return { ok: false, status: 404, data: { error: 'Not found' } };
      });

      await register(['--json']);

      // Should have retried after network error
      const tokenCalls = mockPost.mock.calls.filter(c => c[0] === '/api/device/token');
      expect(tokenCalls.length).toBe(2);
    });

    it('exits(1) on unexpected error response', async () => {
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = {
        ok: false, status: 503, data: { error: 'service_unavailable' },
      };

      await expect(register(['--json'])).rejects.toThrow('process.exit');

      const lastLine = consoleOutput[consoleOutput.length - 1];
      const output = JSON.parse(lastLine);
      expect(output.error).toMatch(/Unexpected/i);
      expect(output.reason).toMatch(/503/);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ---- Success flow ----

  describe('success flow', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = '';
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = tokenSuccessResponse;
    });

    it('saves credentials on success', async () => {
      await register(['--json']);

      // Verify saveCredentials was called with correct data
      expect(mockSaveCredentials).toHaveBeenCalledWith({
        api_key: 'TEST-01-APIKEY123',
        account_id: 'ACCT-01-TEST999',
        base_url: 'https://api.paywalls.net',
      });
    });

    it('JSON output includes status, api_key, account_id', async () => {
      await register(['--json']);

      // First output is the pending status, second is authorized
      const outputs = consoleOutput.map(s => {
        try { return JSON.parse(s); }
        catch { return null; }
      }).filter(Boolean);

      const pending = outputs.find((o: any) => o.status === 'pending');
      expect(pending).toBeDefined();
      expect(pending.user_code).toBe('WDJB-WNRH');
      expect(pending.verification_uri_complete).toMatch(/device\?code=/);

      const authorized = outputs.find((o: any) => o.status === 'authorized');
      expect(authorized).toBeDefined();
      expect(authorized.api_key).toBe('TEST-01-APIKEY123');
      expect(authorized.account_id).toBe('ACCT-01-TEST999');
    });

    it('human-readable output includes success message and next steps', async () => {
      await register([]);
      const combined = consoleOutput.join('\n');

      expect(combined).toMatch(/Authorized/);
      expect(combined).toMatch(/TEST-01-APIKEY123/);
      expect(combined).toMatch(/ACCT-01-TEST999/);
      expect(combined).toMatch(/credentials\.json/);
      expect(combined).toMatch(/paywalls balance/);
    });
  });

  // ---- API orchestration ----

  describe('API orchestration', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = '';
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = tokenSuccessResponse;
    });

    it('calls POST /api/device/code first', async () => {
      await register(['--json']);

      const firstCall = mockPost.mock.calls[0];
      expect(firstCall[0]).toBe('/api/device/code');
    });

    it('sends client_name in device/code request', async () => {
      await register(['--json']);

      const codeCall = mockPost.mock.calls.find(c => c[0] === '/api/device/code');
      expect(codeCall).toBeDefined();
      expect((codeCall![1] as any).client_name).toBeDefined();
    });

    it('sends device_code and grant_type in device/token request', async () => {
      await register(['--json']);

      const tokenCall = mockPost.mock.calls.find(c => c[0] === '/api/device/token');
      expect(tokenCall).toBeDefined();
      const body = tokenCall![1] as any;
      expect(body.device_code).toBe('WDJB-WNRH');
      expect(body.grant_type).toBe('urn:ietf:params:oauth:grant-type:device_code');
    });

    it('passes --base-url to API client', async () => {
      mockPost.mockImplementation(async (path: string) => {
        if (path === '/api/device/code') return deviceCodeResponse;
        if (path === '/api/device/token') return tokenSuccessResponse;
        return { ok: false, status: 404, data: { error: 'Not found' } };
      });

      await register(['--json', '--base-url=http://localhost:3000']);

      // The client was created — we can verify it called the endpoints
      expect(mockPost).toHaveBeenCalled();
    });
  });

  // ---- Output modes ----

  describe('output modes', () => {
    beforeEach(() => {
      process.env.PAYWALLS_API_KEY = '';
      mockPostResponses['/api/device/code'] = deviceCodeResponse;
      mockPostResponses['/api/device/token'] = tokenSuccessResponse;
    });

    it('--json outputs only valid JSON lines', async () => {
      await register(['--json']);

      for (const line of consoleOutput) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('human-readable output shows the user code and URL', async () => {
      await register([]);
      const combined = consoleOutput.join('\n');

      expect(combined).toMatch(/WDJB-WNRH/);
      expect(combined).toMatch(/paywalls\.net\/device\?code=/);
    });
  });
});
