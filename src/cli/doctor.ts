/**
 * paywalls doctor — Diagnose configuration and connectivity.
 *
 * Runs five independent checks in order:
 *  1. Configuration — API key is present (env → .env → credentials file)
 *  2. Connectivity  — API is reachable (health-check GET)
 *  3. Authentication — API key is valid and account is active
 *  4. Wallet        — Wallet exists and has balance
 *  5. Agent         — At least one agent is registered
 *
 * Each check runs independently; a failure in one does not skip later checks.
 * Exit code = 0 if all pass, 1 if any fail.
 *
 * @see paywalls-site-3v5.3.5
 */

import { ApiClient } from '../api-client.js';
import { loadConfig } from '../config.js';
import { formatBalance } from './balance.js';
import { parseFlags } from './util.js';
import { success, error, info, dim } from './output.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail';
  details?: Record<string, unknown>;
  error?: string;
  fix?: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Detect where the API key was sourced from.
 */
export function detectApiKeySource(): string {
  if (process.env.PAYWALLS_API_KEY) return 'environment';
  // We can't distinguish .env from credentials file at this layer,
  // but loadConfig reads credentials file as fallback.
  return 'credentials_file';
}

export function checkConfiguration(): CheckResult {
  const config = loadConfig();
  if (!config.apiKey) {
    return {
      name: 'configuration',
      status: 'fail',
      error: 'No API key found.',
      fix: "Set PAYWALLS_API_KEY or run 'paywalls register'.",
    };
  }

  return {
    name: 'configuration',
    status: 'pass',
    details: {
      api_key_prefix: config.apiKey.slice(0, 8) + '…',
      api_key_source: detectApiKeySource(),
      base_url: config.baseUrl,
    },
  };
}

export async function checkConnectivity(client: ApiClient): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await client.get('/api/health');
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        name: 'connectivity',
        status: 'pass',
        details: {
          url: client.baseUrl,
          status: res.status,
          latency_ms: latencyMs,
        },
      };
    }

    // Non-2xx but reachable — still counts as connectivity pass
    // since the server responded. Many APIs return 401 on /health
    // without auth. Let's treat any response as reachable.
    return {
      name: 'connectivity',
      status: 'pass',
      details: {
        url: client.baseUrl,
        status: res.status,
        latency_ms: latencyMs,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      name: 'connectivity',
      status: 'fail',
      error: `Cannot reach API at ${client.baseUrl}.`,
      fix: 'Check your network connection and base URL.',
      details: { latency_ms: latencyMs },
    };
  }
}

interface MeResponse {
  account_id: string;
  account_name?: string;
  status?: string;
}

export async function checkAuthentication(client: ApiClient): Promise<CheckResult> {
  if (!client.apiKey) {
    return {
      name: 'authentication',
      status: 'fail',
      error: 'Skipped — no API key configured.',
      fix: "Set PAYWALLS_API_KEY or run 'paywalls register'.",
    };
  }

  const res = await client.get<MeResponse>('/api/me');
  if (!res.ok) {
    return {
      name: 'authentication',
      status: 'fail',
      error: `API key invalid or account disabled (HTTP ${res.status}).`,
      fix: "Check your PAYWALLS_API_KEY or run 'paywalls register'.",
    };
  }

  return {
    name: 'authentication',
    status: 'pass',
    details: {
      account_id: res.data.account_id,
      account_name: res.data.account_name,
      account_status: res.data.status ?? 'active',
    },
  };
}

interface BalanceResponse {
  balance: number;
  status?: string;
}

export async function checkWallet(
  client: ApiClient,
  accountId?: string,
): Promise<CheckResult> {
  if (!accountId) {
    return {
      name: 'wallet',
      status: 'fail',
      error: 'Skipped — account could not be resolved.',
      fix: 'Fix authentication first.',
    };
  }

  const res = await client.get<BalanceResponse>(
    `/api/wallet/${accountId}/balance`,
  );

  if (!res.ok) {
    if (res.status === 404) {
      return {
        name: 'wallet',
        status: 'fail',
        error: `No wallet found for account ${accountId}.`,
        fix: "Run 'paywalls topup' to create one.",
      };
    }
    return {
      name: 'wallet',
      status: 'fail',
      error: `Wallet check failed (HTTP ${res.status}).`,
      fix: 'Try again shortly. If the problem persists, contact support.',
    };
  }

  return {
    name: 'wallet',
    status: 'pass',
    details: {
      balance: res.data.balance,
      balance_formatted: formatBalance(res.data.balance),
      status: res.data.status ?? 'active',
    },
  };
}

interface AgentListResponse {
  agents?: { id: string; name: string }[];
}

export async function checkAgent(
  client: ApiClient,
  accountId?: string,
): Promise<CheckResult> {
  if (!accountId) {
    return {
      name: 'agent',
      status: 'fail',
      error: 'Skipped — account could not be resolved.',
      fix: 'Fix authentication first.',
    };
  }

  const res = await client.get<AgentListResponse>(
    `/api/account/${accountId}/agents`,
  );

  if (!res.ok) {
    return {
      name: 'agent',
      status: 'fail',
      error: `Agent check failed (HTTP ${res.status}).`,
      fix: 'Try again shortly. If the problem persists, contact support.',
    };
  }

  const agents = res.data.agents ?? [];
  if (agents.length === 0) {
    return {
      name: 'agent',
      status: 'fail',
      error: 'No agents registered.',
      fix: "paywalls agent register --name \"my-agent\"",
    };
  }

  return {
    name: 'agent',
    status: 'pass',
    details: {
      count: agents.length,
      agents: agents.map(a => ({ id: a.id, name: a.name })),
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function doctor(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const jsonMode = flags.json === true;

  const config = loadConfig({
    apiKey: typeof flags['api-key'] === 'string' ? flags['api-key'] : undefined,
    baseUrl: typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined,
  });
  const client = new ApiClient({
    apiKey: config.apiKey || undefined,
    baseUrl: config.baseUrl,
  });

  const checks: CheckResult[] = [];

  // 1. Configuration
  const configCheck = checkConfiguration();
  checks.push(configCheck);

  // 2. Connectivity
  const connCheck = await checkConnectivity(client);
  checks.push(connCheck);

  // 3. Authentication — resolve account ID for later checks
  let accountId: string | undefined = config.accountId;
  const authCheck = await checkAuthentication(client);
  checks.push(authCheck);
  if (authCheck.status === 'pass' && authCheck.details?.account_id) {
    accountId = authCheck.details.account_id as string;
  }

  // 4. Wallet
  const walletCheck = await checkWallet(client, accountId);
  checks.push(walletCheck);

  // 5. Agent
  const agentCheck = await checkAgent(client, accountId);
  checks.push(agentCheck);

  const passed = checks.filter(c => c.status === 'pass').length;
  const total = checks.length;

  // JSON output
  if (jsonMode) {
    console.log(JSON.stringify({ checks, passed, total }));
    if (passed < total) process.exit(1);
    return;
  }

  // Human-readable output
  console.log('');
  info('Paywalls Developer Environment Check');
  info('=====================================');
  console.log('');

  for (const check of checks) {
    if (check.status === 'pass') {
      success(titleCase(check.name));
      if (check.details) {
        for (const [key, val] of Object.entries(check.details)) {
          info(`  ${formatKey(key)}:  ${formatValue(val)}`);
        }
      }
    } else {
      error(titleCase(check.name));
      if (check.error) {
        info(`  ${check.error}`);
      }
      if (check.fix) {
        info(dim(`  Fix: ${check.fix}`));
      }
    }
    console.log('');
  }

  info(`${passed}/${total} checks passed.`);

  if (passed < total) process.exit(1);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^(.{1,16}).*/, '$1').padEnd(16);
}

function formatValue(val: unknown): string {
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(v => (v as any).name ?? (v as any).id ?? String(v)).join(', ');
  return String(val);
}
