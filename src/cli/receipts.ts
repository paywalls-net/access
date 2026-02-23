/**
 * paywalls receipts — View recent transaction receipts.
 *
 * Flow:
 *  1. Load config, resolve account via /api/me
 *  2. If receipt ID arg given → show single receipt detail
 *  3. Otherwise → list receipts with optional filters
 *
 * @see paywalls-site-3v5.3.4
 */

import { ApiClient } from '../api-client.js';
import { loadConfig } from '../config.js';
import { parseFlags } from './util.js';
import { error, info, dim } from './output.js';

interface MeResponse {
  account_id: string;
  account_name: string;
  user_id: number;
  user_type: string;
}

interface Receipt {
  publicId?: string;
  id?: string;
  type: string;
  amount: number;
  domain?: string;
  url?: string;
  created_at?: string;
  createdAt?: string;
  status?: string;
  description?: string;
  [key: string]: unknown;
}

interface ReceiptsListResponse {
  receipts: Receipt[];
  limit: number;
  offset: number;
  total?: number;
}

/**
 * Format millicents as dollars string with sign.
 * e.g. -1000 → "-$0.01", 500000 → "+$5.00"
 */
function formatAmount(millicents: number): string {
  const abs = Math.abs(millicents);
  const dollars = abs / 100_000;
  const sign = millicents < 0 ? '-' : '+';
  return `${sign}$${dollars.toFixed(2)}`;
}

/**
 * Format ISO date to local short format for display.
 */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Get the receipt ID from a receipt object (supports both publicId and id fields).
 */
function receiptId(r: Receipt): string {
  return r.publicId || r.id?.toString() || '—';
}

/**
 * Get the created date from a receipt object (supports both created_at and createdAt).
 */
function receiptDate(r: Receipt): string | undefined {
  return r.created_at || r.createdAt;
}

/**
 * Resolve account from config/API key. Shared setup for both list and detail.
 */
async function resolveAccount(
  client: ApiClient,
  jsonMode: boolean,
): Promise<{ accountId: string; accountName?: string } | null> {
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

  return { accountId, accountName };
}

/**
 * Show a single receipt in detail view.
 */
async function showReceipt(
  client: ApiClient,
  accountId: string,
  publicId: string,
  jsonMode: boolean,
): Promise<void> {
  const res = await client.get<Receipt>(
    `/api/wallet/${accountId}/receipts/${publicId}`,
  );

  if (!res.ok) {
    const errData = res.data as any;
    if (res.status === 404) {
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unable to retrieve receipt.',
          reason: `No receipt exists with ID '${publicId}'.`,
          resolution: "Run 'paywalls receipts' to list available receipts.",
        }));
      } else {
        error('Unable to retrieve receipt.');
        info(`  Reason: No receipt exists with ID '${publicId}'.`);
        info("  Fix: Run 'paywalls receipts' to list available receipts.");
      }
    } else {
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unable to retrieve receipt.',
          reason: `API returned HTTP ${res.status}: ${errData?.error || 'Unknown error'}.`,
          resolution: 'Try again shortly. If the problem persists, contact support.',
        }));
      } else {
        error('Unable to retrieve receipt.');
        info(`  Reason: API returned HTTP ${res.status}: ${errData?.error || 'Unknown error'}.`);
        info('  Fix: Try again shortly. If the problem persists, contact support.');
      }
    }
    process.exit(1);
  }

  const r = res.data;

  if (jsonMode) {
    console.log(JSON.stringify({
      ...r,
      amount_formatted: formatAmount(r.amount),
    }));
    return;
  }

  // Human-readable detail view
  info(`Receipt: ${receiptId(r)}`);
  info(`  Type:     ${r.type}`);
  info(`  Amount:   ${formatAmount(r.amount)} (${Math.abs(r.amount).toLocaleString()} millicents)`);
  if (r.domain) info(`  Domain:   ${r.domain}`);
  if (r.url) info(`  URL:      ${r.url}`);
  info(`  Date:     ${receiptDate(r) || '—'}`);
  if (r.status) info(`  Status:   ${r.status}`);
  if (r.description) info(`  Note:     ${r.description}`);
}

/**
 * List receipts in table format.
 */
async function listReceipts(
  client: ApiClient,
  accountId: string,
  flags: Record<string, string | boolean>,
  jsonMode: boolean,
): Promise<void> {
  const limit = typeof flags.limit === 'string' ? Math.min(Math.max(parseInt(flags.limit, 10) || 10, 1), 100) : 10;
  const offset = typeof flags.offset === 'string' ? Math.max(parseInt(flags.offset, 10) || 0, 0) : 0;

  // Build query string
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (typeof flags.type === 'string' && flags.type !== 'all') params.set('type', flags.type);
  if (typeof flags.domain === 'string') params.set('domain', flags.domain);

  const res = await client.get<ReceiptsListResponse>(
    `/api/wallet/${accountId}/receipts?${params.toString()}`,
  );

  if (!res.ok) {
    const errData = res.data as any;
    if (res.status === 404) {
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unable to retrieve receipts.',
          reason: `No wallet exists for account ${accountId}.`,
          resolution: 'Visit https://paywalls.net to set up your wallet.',
        }));
      } else {
        error('Unable to retrieve receipts.');
        info(`  Reason: No wallet exists for account ${accountId}.`);
        info('  Fix: Visit https://paywalls.net to set up your wallet.');
      }
    } else {
      if (jsonMode) {
        console.log(JSON.stringify({
          error: 'Unable to retrieve receipts.',
          reason: `API returned HTTP ${res.status}: ${errData?.error || 'Unknown error'}.`,
          resolution: 'Try again shortly. If the problem persists, contact support.',
        }));
      } else {
        error('Unable to retrieve receipts.');
        info(`  Reason: API returned HTTP ${res.status}: ${errData?.error || 'Unknown error'}.`);
        info('  Fix: Try again shortly. If the problem persists, contact support.');
      }
    }
    process.exit(1);
  }

  const { receipts: items, limit: rLimit, offset: rOffset } = res.data;
  const total = res.data.total;

  // JSON output
  if (jsonMode) {
    console.log(JSON.stringify({
      receipts: items.map((r) => ({
        ...r,
        amount_formatted: formatAmount(r.amount),
      })),
      total,
      limit: rLimit,
      offset: rOffset,
    }));
    return;
  }

  // Empty state
  if (items.length === 0) {
    info('No receipts yet. Use the SDK to access content and receipts will appear here.');
    return;
  }

  // Table header
  const header = padRow('DATE', 'TYPE', 'AMOUNT', 'DOMAIN', 'RECEIPT');
  info(`\nRecent transactions:\n`);
  info(dim(header));

  // Table rows
  for (const r of items) {
    const row = padRow(
      formatDate(receiptDate(r)),
      r.type,
      formatAmount(r.amount),
      r.domain || '—',
      receiptId(r),
    );
    info(row);
  }

  // Footer
  const countMsg = total != null
    ? `Showing ${items.length} of ${total} receipts.`
    : `Showing ${items.length} receipts.`;
  info(`\n${dim(countMsg + ' Use --limit to show more.')}`);
}

/**
 * Pad columns for table output.
 */
function padRow(
  date: string,
  type: string,
  amount: string,
  domain: string,
  receipt: string,
): string {
  return [
    date.padEnd(18),
    type.padEnd(8),
    amount.padEnd(10),
    domain.padEnd(22),
    receipt,
  ].join('  ');
}

export async function receipts(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const jsonMode = flags.json === true;

  const client = new ApiClient();
  const account = await resolveAccount(client, jsonMode);
  if (!account) return; // unreachable — resolveAccount exits on failure

  // Check if first positional arg is a receipt ID (not a flag)
  const firstArg = args.find((a) => !a.startsWith('--'));

  if (firstArg) {
    await showReceipt(client, account.accountId, firstArg, jsonMode);
  } else {
    await listReceipts(client, account.accountId, flags, jsonMode);
  }
}
