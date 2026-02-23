/**
 * CLI utility functions.
 *
 * - isHeadless(): detect CI / non-interactive environments
 * - openBrowser(): open a URL in the default browser
 * - parseArgs(): minimal argument parsing (no deps)
 */

import { exec } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Detect headless / CI environment (no interactive browser available).
 */
export function isHeadless(): boolean {
  return (
    !process.stdout.isTTY ||
    process.env.CI !== undefined ||
    process.env.CODESPACES !== undefined ||
    process.env.SSH_CONNECTION !== undefined
  );
}

/**
 * Open a URL in the default browser. No-op in headless environments.
 *
 * @param url - The URL to open
 * @param opts.incognito - Open in a private/incognito window (Chrome, Firefox, Edge)
 */
export function openBrowser(url: string, opts: { incognito?: boolean } = {}): void {
  if (isHeadless()) return;

  const quotedUrl = JSON.stringify(url);

  if (opts.incognito && platform() === 'darwin') {
    // Try Chrome first (most common dev browser), fall back to Firefox, then default
    exec(
      `open -na "Google Chrome" --args --incognito ${quotedUrl} 2>/dev/null || ` +
      `open -a Firefox --args -private-window ${quotedUrl} 2>/dev/null || ` +
      `open ${quotedUrl}`,
    );
    return;
  }

  if (opts.incognito && platform() === 'linux') {
    exec(
      `google-chrome --incognito ${quotedUrl} 2>/dev/null || ` +
      `firefox -private-window ${quotedUrl} 2>/dev/null || ` +
      `xdg-open ${quotedUrl}`,
    );
    return;
  }

  if (opts.incognito && platform() === 'win32') {
    exec(`start chrome --incognito ${quotedUrl}`);
    return;
  }

  const cmd =
    platform() === 'darwin'
      ? 'open'
      : platform() === 'win32'
        ? 'start'
        : 'xdg-open';

  exec(`${cmd} ${quotedUrl}`);
}

/**
 * Minimal flag parser. Returns a map of --key=value and --flag (true).
 */
export function parseFlags(
  args: string[],
): Record<string, string | boolean> {
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
}
