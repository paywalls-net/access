/**
 * Shared output formatting utilities for CLI commands.
 *
 * Handles:
 *  - Colored output (when TTY supports it and not in headless mode)
 *  - Headless/CI-friendly plain text mode (no ANSI escape codes)
 *  - Structured JSON output (--json flag)
 *
 * Color is disabled when:
 *  - `--headless` or `--json` flag is passed
 *  - `CI` environment variable is set
 *  - `NO_COLOR` environment variable is set (https://no-color.org)
 *  - stdout is not a TTY (piped output)
 */

import { isHeadless } from './util.js';

/**
 * Determine whether color output is supported.
 * Evaluated on each call so that runtime flags (`--headless`, `--json`)
 * and env changes are respected.
 */
function isColorEnabled(): boolean {
  if (isHeadless()) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  return !!process.stdout.isTTY;
}

export function success(message: string): void {
  if (isColorEnabled()) {
    console.log(`\x1b[32m✓\x1b[0m ${message}`);
  } else {
    console.log(`✓ ${message}`);
  }
}

export function error(message: string): void {
  if (isColorEnabled()) {
    console.error(`\x1b[31m✗\x1b[0m ${message}`);
  } else {
    console.error(`✗ ${message}`);
  }
}

export function info(message: string): void {
  console.log(message);
}

export function warn(message: string): void {
  if (isColorEnabled()) {
    console.warn(`\x1b[33m⚠\x1b[0m ${message}`);
  } else {
    console.warn(`⚠ ${message}`);
  }
}

/**
 * Dim text (grey). Returns the string with or without ANSI codes.
 */
export function dim(message: string): string {
  if (isColorEnabled()) {
    return `\x1b[2m${message}\x1b[0m`;
  }
  return message;
}

/**
 * Display a progress indicator.
 * In interactive mode: writes dots inline (no newline).
 * In headless mode: writes a static line.
 */
export function progress(message: string): void {
  if (isColorEnabled()) {
    process.stdout.write(message);
  } else {
    console.log(message);
  }
}
