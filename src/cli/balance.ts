/**
 * paywalls balance — Check wallet balance.
 *
 * Flow:
 *  1. Load config (env → .env → credentials file)
 *  2. Call GET /api/me to resolve account from API key
 *  3. Call GET /api/wallet/:accountPublicId/balance
 *  4. Display formatted result
 *
 * @see paywalls-site-3v5.3.2
 */

import { ApiClient } from '../api-client.js';
import { loadConfig } from '../config.js';
import { parseFlags } from './util.js';
import { success, error, info, dim } from './output.js';

interface MeResponse {
  account_id: string;
  account_name: string;
  user_id: number;
  user_type: string;
}

interface BalanceResponse {
  balance: number;
}

/**
 * Format millicents as dollars string.
 * e.g. 150000 → "$1.50"
 */
function formatBalance(millicents: number): string {
  const dollars = millicents / 100_000;
  return `$${dollars.toFixed(2)}`;
}

export async function balance(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const jsonMode = flags.json === true;

  // Load config and validate
  const config = loadConfig();
  if (!config.apiKey) {
    if (jsonMode) {
      console.log(JSON.stringify({
        error: 'Unable to authenticate.',
        reason: 'No key found in PAYWALLS_API_KEY, .env, or credentials file.',
        resolution: "Set PAYWALLS_API_KEY or run 'paywalls register'.",
      }));
    } else {
      error('Unable to authenticate.');
      info('  Reason: No key found in PAYWALLS_API_KEY, .env, or credentials file.');
      info("  Fix: Set PAYWALLS_API_KEY or run 'paywalls register'.");
    }
    process.exit(1);
  }

  const client = new ApiClient();

  // Step 1: Resolve account from API key
  let accountId = config.accountId;
  let accountName: string | undefined;

  if (!accountId) {
    const meRes = await client.get<MeResponse>('/api/me');
    if (!meRes.ok) {
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unable to identify account.',
          reason: `API returned HTTP ${meRes.status}. The API key may be invalid or expired.`,
          resolution: "Check your PAYWALLS_API_KEY or run 'paywalls register'.",
        }));
      } else {
        error('Unable to identify account.');
        info(`  Reason: API returned HTTP ${meRes.status}. The API key may be invalid or expired.`);
        info("  Fix: Check your PAYWALLS_API_KEY or run 'paywalls register'.");
      }
      process.exit(1);
    }
    accountId = meRes.data.account_id;
    accountName = meRes.data.account_name;
  }

  // Step 2: Fetch wallet balance
  const balanceRes = await client.get<BalanceResponse>(
    `/api/wallet/${accountId}/balance`,
  );

  if (!balanceRes.ok) {
    const errData = balanceRes.data as any;
    if (balanceRes.status === 404) {
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unable to retrieve balance.',
          reason: `No wallet exists for account ${accountId}.`,
          resolution: 'Visit https://paywalls.net to set up your wallet.',
        }));
      } else {
        error('Unable to retrieve balance.');
        info(`  Reason: No wallet exists for account ${accountId}.`);
        info('  Fix: Visit https://paywalls.net to set up your wallet.');
      }
      process.exit(1);
    }
    if (jsonMode) {
      console.log(JSON.stringify({
        error: 'Unable to retrieve balance.',
        reason: `API returned HTTP ${balanceRes.status}: ${errData?.error || 'Unknown error'}.`,
        resolution: 'Try again shortly. If the problem persists, contact support.',
      }));
    } else {
      error('Unable to retrieve balance.');
      info(`  Reason: API returned HTTP ${balanceRes.status}: ${errData?.error || 'Unknown error'}.`);
      info('  Fix: Try again shortly. If the problem persists, contact support.');
    }
    process.exit(1);
  }

  const millicents = balanceRes.data.balance;

  // Step 3: Output
  if (jsonMode) {
    console.log(
      JSON.stringify({
        account_id: accountId,
        account_name: accountName,
        balance: millicents,
        balance_formatted: formatBalance(millicents),
        currency: 'USD',
      }),
    );
    return;
  }

  // Human-readable output
  success(`Balance: ${formatBalance(millicents)}`);
  info(`  Account:    ${accountId}`);
  if (accountName) {
    info(`  Name:       ${accountName}`);
  }
  info(`  Millicents: ${millicents.toLocaleString()}`);
  info(dim(`  Currency:   USD`));
}
