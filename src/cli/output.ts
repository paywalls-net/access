/**
 * Shared output formatting utilities for CLI commands.
 *
 * Handles:
 *  - Colored output (when TTY supports it)
 *  - Headless/CI-friendly plain text mode
 *  - Structured JSON output (--json flag)
 */

const isColorSupported =
  process.stdout.isTTY && process.env.NO_COLOR === undefined;

export function success(message: string): void {
  if (isColorSupported) {
    console.log(`\x1b[32m✓\x1b[0m ${message}`);
  } else {
    console.log(`✓ ${message}`);
  }
}

export function error(message: string): void {
  if (isColorSupported) {
    console.error(`\x1b[31m✗\x1b[0m ${message}`);
  } else {
    console.error(`✗ ${message}`);
  }
}

export function info(message: string): void {
  console.log(message);
}

export function warn(message: string): void {
  if (isColorSupported) {
    console.warn(`\x1b[33m⚠\x1b[0m ${message}`);
  } else {
    console.warn(`⚠ ${message}`);
  }
}

export function dim(message: string): string {
  if (isColorSupported) {
    return `\x1b[2m${message}\x1b[0m`;
  }
  return message;
}
