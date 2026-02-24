/**
 * Topup command — unit tests
 *
 * The topup command is currently a V0 stub. Tests verify:
 *  1. Human-readable output mentions the command
 *  2. JSON output returns proper error structure
 *  3. Headless mode produces no ANSI codes
 *
 * @see paywalls-site-3v5.3.3
 * @see src/cli/topup.ts
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

// Dynamic imports after mocks
const { topup } = await import('../../src/cli/topup.js');

// ---------------------------------------------------------------------------
// Console capture
// ---------------------------------------------------------------------------
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args: any[]) => consoleOutput.push(args.join(' '));
  console.error = (...args: any[]) => consoleErrors.push(args.join(' '));
});

afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('paywalls topup', () => {
  describe('human-readable output', () => {
    it('displays a not-yet-implemented message', async () => {
      await topup([]);
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/not yet implemented/i);
    });

    it('mentions paywalls.net as an alternative', async () => {
      await topup([]);
      const output = consoleOutput.join('\n');
      expect(output).toMatch(/paywalls\.net/);
    });

    it('does not call process.exit', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as any);
      try {
        await topup([]);
        expect(mockExit).not.toHaveBeenCalled();
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe('JSON output', () => {
    it('returns valid JSON with error structure', async () => {
      await topup(['--json']);
      const raw = consoleOutput.join('');
      const output = JSON.parse(raw);
      expect(output).toHaveProperty('error');
      expect(output).toHaveProperty('resolution');
    });

    it('error message indicates not implemented', async () => {
      await topup(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.error).toMatch(/not.*implemented/i);
    });

    it('resolution mentions paywalls.net', async () => {
      await topup(['--json']);
      const output = JSON.parse(consoleOutput.join(''));
      expect(output.resolution).toMatch(/paywalls\.net/);
    });
  });

  describe('headless mode', () => {
    it('produces no ANSI escape codes', async () => {
      await topup(['--headless']);
      const allOutput = [...consoleOutput, ...consoleErrors].join('');
      expect(allOutput).not.toMatch(/\x1b/);
    });

    it('produces no ANSI escape codes in JSON mode', async () => {
      await topup(['--json']);
      const allOutput = [...consoleOutput, ...consoleErrors].join('');
      expect(allOutput).not.toMatch(/\x1b/);
    });
  });
});
