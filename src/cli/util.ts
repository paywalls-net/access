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
 *
 * Headless mode activates when ANY of:
 *  - `--headless` flag is passed
 *  - `CI` environment variable is set (GitHub Actions, GitLab CI, Jenkins, etc.)
 *  - `CODESPACES` or `SSH_CONNECTION` env var is set
 *  - stdout is not a TTY (piped output)
 *  - `--json` flag is passed (implies headless)
 */
export function isHeadless(): boolean {
  return (
    process.argv.includes('--headless') ||
    process.argv.includes('--json') ||
    process.env.CI !== undefined ||
    process.env.CODESPACES !== undefined ||
    process.env.SSH_CONNECTION !== undefined ||
    !process.stdout.isTTY
  );
}

/**
 * Detect `--json` output mode. Implies headless behavior.
 */
export function isJsonMode(): boolean {
  return process.argv.includes('--json');
}

/**
 * Open a URL in the default browser.
 * In headless environments, prints the URL to stdout instead of opening a browser.
 *
 * @param url - The URL to open
 * @param opts.incognito - Open in a private/incognito window (Chrome, Firefox, Edge)
 */
export function openBrowser(url: string, opts: { incognito?: boolean } = {}): void {
  if (isHeadless()) {
    console.log(url);
    return;
  }

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
