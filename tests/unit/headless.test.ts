/**
 * Headless mode — unit tests
 *
 * Tests isHeadless(), isJsonMode() detection and output behavior
 * (no ANSI codes, browser URL printed instead of opened).
 *
 * @see paywalls-site-3v5.3.6
 * @see src/cli/util.ts
 * @see src/cli/output.ts
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock child_process.exec so openBrowser never spawns a real process
// ---------------------------------------------------------------------------
const mockExec = jest.fn();
jest.unstable_mockModule('node:child_process', () => ({
  exec: mockExec,
}));

const { isHeadless, isJsonMode, openBrowser } = await import('../../src/cli/util.js');
const { success, error, warn, dim, progress } = await import('../../src/cli/output.js');

// ---------------------------------------------------------------------------
// Helpers to manipulate process.argv and env
// ---------------------------------------------------------------------------
const originalArgv = [...process.argv];
const originalEnv = { ...process.env };
const originalIsTTY = process.stdout.isTTY;

let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
let stdoutWrites: string[] = [];
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
const origWrite = process.stdout.write;

beforeEach(() => {
  process.argv = [...originalArgv];
  process.env = { ...originalEnv };
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
  delete process.env.CI;
  delete process.env.CODESPACES;
  delete process.env.SSH_CONNECTION;
  delete process.env.NO_COLOR;
  mockExec.mockReset();
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
});

afterAll(() => {
  process.argv = originalArgv;
  process.env = originalEnv;
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
  console.log = origLog;
  console.error = origError;
  console.warn = origWarn;
  process.stdout.write = origWrite;
});

// ---------------------------------------------------------------------------
// 1. isHeadless() detection
// ---------------------------------------------------------------------------

describe('isHeadless', () => {
  it('returns true when --headless flag is in argv', () => {
    process.argv.push('--headless');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns true when --json flag is in argv', () => {
    process.argv.push('--json');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns true when CI env var is set', () => {
    process.env.CI = 'true';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns true when CI env var is empty string (still defined)', () => {
    process.env.CI = '';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns true when CODESPACES env var is set', () => {
    process.env.CODESPACES = 'true';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns true when SSH_CONNECTION env var is set', () => {
    process.env.SSH_CONNECTION = '1.2.3.4 1234 5.6.7.8 22';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns true when stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    expect(isHeadless()).toBe(true);
  });

  it('returns false when TTY and no headless indicators', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isHeadless()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. isJsonMode() detection
// ---------------------------------------------------------------------------

describe('isJsonMode', () => {
  it('returns true when --json flag is in argv', () => {
    process.argv.push('--json');
    expect(isJsonMode()).toBe(true);
  });

  it('returns false when --json flag is absent', () => {
    expect(isJsonMode()).toBe(false);
  });

  it('--json implies headless', () => {
    process.argv.push('--json');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    expect(isJsonMode()).toBe(true);
    expect(isHeadless()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Output functions: no ANSI codes in headless mode
// ---------------------------------------------------------------------------

describe('output in headless mode', () => {
  beforeEach(() => {
    // Force headless via CI env
    process.env.CI = 'true';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  it('success() emits no ANSI escape codes', () => {
    success('test message');
    const output = consoleOutput.join('');
    expect(output).not.toMatch(/\x1b/);
    expect(output).toContain('✓');
    expect(output).toContain('test message');
  });

  it('error() emits no ANSI escape codes', () => {
    error('bad thing');
    const output = consoleErrors.join('');
    expect(output).not.toMatch(/\x1b/);
    expect(output).toContain('✗');
    expect(output).toContain('bad thing');
  });

  it('warn() emits no ANSI escape codes', () => {
    warn('careful');
    const output = consoleErrors.join('');
    expect(output).not.toMatch(/\x1b/);
    expect(output).toContain('⚠');
    expect(output).toContain('careful');
  });

  it('dim() returns plain text without ANSI', () => {
    const result = dim('faded text');
    expect(result).not.toMatch(/\x1b/);
    expect(result).toBe('faded text');
  });

  it('progress() writes a full line (console.log) in headless mode', () => {
    progress('.');
    expect(consoleOutput).toContain('.');
  });
});

// ---------------------------------------------------------------------------
// 4. openBrowser: prints URL in headless mode, opens browser in interactive
// ---------------------------------------------------------------------------

describe('openBrowser', () => {
  it('prints URL to stdout in headless mode (no exec)', () => {
    process.env.CI = 'true';
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    openBrowser('https://example.com/verify?code=ABC');

    expect(consoleOutput).toContain('https://example.com/verify?code=ABC');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('calls exec to open browser in interactive mode', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    openBrowser('https://example.com');

    expect(mockExec).toHaveBeenCalled();
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('https://example.com');
  });
});
