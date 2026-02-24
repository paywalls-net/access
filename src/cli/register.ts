/**
 * paywalls register — Device-code registration flow.
 *
 * 1. POST /api/device/code → get code + verification URL
 * 2. Open browser to verification URL
 * 3. Poll POST /api/device/token until approved or expired
 * 4. Save API key to credentials file
 */
/**
 * paywalls register — Device-code registration flow.
 *
 * Implements the client side of RFC 8628 (OAuth 2.0 Device Authorization Grant),
 * adapted for account creation. A developer runs this in a terminal, confirms in
 * a browser, and gets a stored API key.
 *
 * Flow:
 *  1. POST /api/device/code → get device_code + verification URL
 *  2. Display code and URL, open browser (unless headless)
 *  3. Poll POST /api/device/token until approved, expired, or denied
 *  4. Save credentials to ~/.config/paywalls/credentials.json
 *
 * @see paywalls-site-3v5.3.1
 * @see RFC 8628 https://www.rfc-editor.org/rfc/rfc8628
 */

import { hostname } from 'node:os';
import { ApiClient } from '../api-client.js';
import { loadConfig, saveCredentials, hasCredentials } from '../config.js';
import { parseFlags, isHeadless, openBrowser } from './util.js';
import { success, error, info, dim, progress } from './output.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenSuccessResponse {
  api_key: string;
  account_id: string;
  token_type: string;
  message?: string;
}

interface TokenErrorResponse {
  error: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sleep for the given number of milliseconds. Exported for test seams. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function register(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const jsonMode = flags.json === true;
  const headless = flags.headless === true || isHeadless();
  const force = flags.force === true;
  const incognito = flags.incognito === true;

  // ---- Guard: already registered ----
  if (!force && hasCredentials()) {
    if (jsonMode) {
      console.log(JSON.stringify({
        error: 'Credentials already exist.',
        reason: 'Credentials found at ~/.config/paywalls/credentials.json.',
        resolution: "Run 'paywalls register --force' to overwrite.",
      }));
    } else {
      error('Credentials already exist at ~/.config/paywalls/credentials.json.');
      info("  Use --force to overwrite.");
    }
    process.exit(1);
  }

  const config = loadConfig({
    baseUrl: typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined,
  });
  // No API key needed — device-code is the bootstrap
  const client = new ApiClient({ baseUrl: config.baseUrl });

  // ---- Step 1: Request device code ----
  if (!jsonMode) info('Registering device...\n');

  let codeRes;
  try {
    codeRes = await client.post<DeviceCodeResponse>('/api/device/code', {
      client_name: hostname(),
    });
  } catch {
    if (jsonMode) {
      console.log(JSON.stringify({
        error: 'Cannot reach API.',
        reason: `Network error contacting ${config.baseUrl}.`,
        resolution: 'Check your internet connection and base URL.',
      }));
    } else {
      error(`Cannot reach ${config.baseUrl}.`);
      info('  Check your internet connection and base URL.');
    }
    process.exit(1);
  }

  if (!codeRes.ok) {
    if (jsonMode) {
      console.log(JSON.stringify({
        error: 'Failed to initiate registration.',
        reason: `Server returned HTTP ${codeRes.status}.`,
        resolution: 'Try again later. If the problem persists, contact support.',
      }));
    } else {
      error(`Failed to initiate registration (HTTP ${codeRes.status}).`);
      info('  Try again later. If the problem persists, contact support.');
    }
    process.exit(1);
  }

  const {
    device_code,
    user_code,
    verification_uri_complete,
    expires_in,
    interval: pollIntervalSec,
  } = codeRes.data;

  // ---- Step 2: Display code and URL ----
  if (jsonMode) {
    console.log(JSON.stringify({
      status: 'pending',
      user_code,
      verification_uri_complete,
      expires_in,
    }));
  } else {
    info(`Your code is: ${user_code}\n`);
    info('Open this URL to authorize:');
    info(`  ${verification_uri_complete}\n`);
    info(
      `Waiting for authorization... ${dim(`(expires in ${Math.floor(expires_in / 60)} minutes)`)}`,
    );
  }

  // ---- Step 3: Open browser (unless headless) ----
  if (!headless) {
    openBrowser(verification_uri_complete, { incognito });
  }

  // ---- Step 4: Poll for token ----
  let intervalMs = pollIntervalSec * 1000;
  let aborted = false;

  const onAbort = (): void => {
    aborted = true;
    if (!jsonMode) {
      console.log('');
      info('Registration cancelled.');
    }
    process.exit(130);
  };
  process.on('SIGINT', onAbort);

  try {
    while (!aborted) {
      await sleep(intervalMs);

      let tokenRes;
      try {
        tokenRes = await client.post<TokenSuccessResponse | TokenErrorResponse>(
          '/api/device/token',
          {
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          },
        );
      } catch {
        // Network error during polling — keep trying
        if (!jsonMode) progress('!');
        continue;
      }

      // ---- 200: Approved ----
      if (tokenRes.ok) {
        const data = tokenRes.data as TokenSuccessResponse;

        saveCredentials({
          api_key: data.api_key,
          account_id: data.account_id,
          base_url: config.baseUrl,
        });

        if (jsonMode) {
          console.log(JSON.stringify({
            status: 'authorized',
            api_key: data.api_key,
            account_id: data.account_id,
          }));
        } else {
          console.log('');
          success('Authorized!');
          console.log('');
          info(`  API Key:  ${data.api_key}`);
          info(`  Account:  ${data.account_id}`);
          console.log('');
          info(dim('Saved to ~/.config/paywalls/credentials.json'));
          console.log('');
          info('Next steps:');
          info('  paywalls balance     Check your wallet balance');
          info('  paywalls topup       Add funds to your wallet');
        }
        return;
      }

      const errData = tokenRes.data as TokenErrorResponse;

      // ---- 428: Authorization pending ----
      if (tokenRes.status === 428 && errData.error === 'authorization_pending') {
        if (!jsonMode) progress('.');
        continue;
      }

      // ---- 429: Slow down (RFC 8628 §3.5) ----
      if (tokenRes.status === 429 && errData.error === 'slow_down') {
        intervalMs += 5000;
        continue;
      }

      // ---- 400: Expired or denied ----
      if (errData.error === 'expired_token') {
        if (jsonMode) {
          console.log(JSON.stringify({
            error: 'Device code expired.',
            resolution: "Run 'paywalls register' again.",
          }));
        } else {
          console.log('');
          error("Device code expired. Run 'paywalls register' again.");
        }
        process.exit(1);
      }

      if (errData.error === 'access_denied') {
        if (jsonMode) {
          console.log(JSON.stringify({
            error: 'Authorization denied.',
            resolution: 'Contact support if this is unexpected.',
          }));
        } else {
          console.log('');
          error('Authorization denied. Contact support if this is unexpected.');
        }
        process.exit(1);
      }

      // ---- Unknown error ----
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unexpected response.',
          reason: `HTTP ${tokenRes.status}: ${errData.error || 'Unknown'}`,
          resolution: "Try again. Run 'paywalls register'.",
        }));
      } else {
        console.log('');
        error(`Unexpected response (HTTP ${tokenRes.status}).`);
        info("  Fix: Try again. Run 'paywalls register'.");
      }
      process.exit(1);
    }
  } finally {
    process.removeListener('SIGINT', onAbort);
  }
}
