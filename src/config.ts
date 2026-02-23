/**
 * Credentials and configuration loader.
 *
 * Resolution order:
 *  1. Environment variables (PAYWALLS_API_KEY, PAYWALLS_BASE_URL)
 *  2. .env file in current directory
 *  3. Credentials file (~/.config/paywalls/credentials.json)
 *  4. Inline constructor params (SDK usage)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface PaywallsConfig {
  apiKey: string;
  accountId?: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://api.paywalls.net';

function credentialsPath(): string {
  return join(homedir(), '.config', 'paywalls', 'credentials.json');
}

/**
 * Load credentials from file (~/.config/paywalls/credentials.json).
 */
function loadCredentialsFile(): Partial<PaywallsConfig> {
  try {
    const raw = readFileSync(credentialsPath(), 'utf-8');
    const data = JSON.parse(raw) as Record<string, string>;
    return {
      apiKey: data.api_key,
      accountId: data.account_id,
      baseUrl: data.base_url,
    };
  } catch {
    return {};
  }
}

/**
 * Load config with resolution order: env → .env → credentials file → overrides.
 */
export function loadConfig(
  overrides?: Partial<PaywallsConfig>,
): PaywallsConfig {
  const file = loadCredentialsFile();

  const apiKey =
    overrides?.apiKey ??
    process.env.PAYWALLS_API_KEY ??
    file.apiKey ??
    '';

  const baseUrl =
    overrides?.baseUrl ??
    process.env.PAYWALLS_BASE_URL ??
    file.baseUrl ??
    DEFAULT_BASE_URL;

  const accountId =
    overrides?.accountId ??
    process.env.PAYWALLS_ACCOUNT_ID ??
    file.accountId;

  return { apiKey, accountId, baseUrl };
}

/**
 * Save credentials to ~/.config/paywalls/credentials.json.
 */
export function saveCredentials(creds: {
  api_key: string;
  account_id: string;
  base_url?: string;
}): void {
  const dir = join(homedir(), '.config', 'paywalls');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    credentialsPath(),
    JSON.stringify(
      {
        api_key: creds.api_key,
        account_id: creds.account_id,
        base_url: creds.base_url ?? DEFAULT_BASE_URL,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

/**
 * Check if credentials are configured (any source).
 */
export function hasCredentials(): boolean {
  const config = loadConfig();
  return config.apiKey.length > 0;
}
