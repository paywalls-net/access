# Getting Started with @paywalls-net/access
Fetch articles, pages, and other publisher content that is cleaned, optimized for LLM consumption, and fully licensed. No scraping, no legal gray areas — every response is a legitimate content transaction between your wallet and the publisher.

5-minute guide to wallet-backed content access for AI agents.

Install → register → fetch licensed content, entirely from your terminal.

## 1. Install

```bash
npm install -g @paywalls-net/access
```

Or skip the global install — every command works with `npx`:

```bash
npx @paywalls-net/access --help
```

## 2. Register

```bash
paywalls register
```

Expected output:

```
Registering device...
Your code is: WDJB-WNRH
Open this URL to authorize:
  https://paywalls.net/device?code=WDJB-WNRH
Waiting for authorization... (expires in 15 minutes)
..........
✓ Authorized!
  API Key:  FL0QCW-01-MLYIB66U
  Account:  ABUI8C-01-MLYIB66L
Saved to ~/.config/paywalls/credentials.json
Next steps:
  paywalls balance     Check your wallet balance
  paywalls topup       Add funds to your wallet
```

Your browser opens to approve the device code. Once you confirm, your API key is saved to `~/.config/paywalls/credentials.json`.

> **CI / headless?** Add `--headless` — you'll get a URL to open manually instead of auto-launching the browser. Headless mode is auto-detected in CI environments, SSH sessions, and Codespaces.

> **Already registered?** Use `--force` to overwrite existing credentials.

**If it fails:** Run `paywalls doctor` — it will tell you exactly what went wrong and how to fix it.

## 3. Check Your Setup

```bash
paywalls doctor
```

Expected output when everything is working:

```
Paywalls Developer Environment Check
=====================================

✓ Configuration
  Api Key Prefix  :  FL0QCW-0…
  Api Key Source  :  credentials_file
  Base Url        :  https://api.paywalls.net

✓ Connectivity
  Url             :  https://api.paywalls.net
  Status          :  200
  Latency Ms      :  45

✓ Authentication
  Account Id      :  ABUI8C-01-MLYIB66L
  Account Name    :  Developer Account
  Account Status  :  active

✓ Wallet
  Balance         :  500000
  Balance Formatted:  $5.00
  Status          :  active

✓ Agent
  Count           :  1

5/5 checks passed.
```

All five checks should pass: configuration, connectivity, authentication, wallet, and agent. Each failed check prints a `Fix:` message with the exact CLI command to resolve it.

## 4. Fund Your Wallet

```bash
paywalls topup
```

Check your balance anytime:

```bash
paywalls balance
```

Expected output:

```
✓ Balance: $5.00
  Account:    ABUI8C-01-MLYIB66L
  Millicents: 500,000
  Currency:   USD
```

## 5. Use in Your App

The SDK auto-loads credentials from `~/.config/paywalls/credentials.json`, or you can set an env var:

```bash
export PAYWALLS_API_KEY=$(jq -r .api_key ~/.config/paywalls/credentials.json)
```

Then use `ApiClient` in your code:

```typescript
import { ApiClient } from '@paywalls-net/access';

const client = new ApiClient();        // auto-loads credentials
const response = await client.get('/api/wallet/balance');
console.log(response.data);           // { balance: 500000, currency: 'USD' }
```

Or make a licensed content fetch:

```typescript
const page = await client.get('/access/https://example.com/article');
console.log(page.status);             // 200
console.log(page.data);               // article content
```

## 6. View Receipts

```bash
paywalls receipts              # recent transactions (default: last 10)
paywalls receipts --limit=5    # last 5
paywalls receipts <receipt-id> # single receipt detail
```

Filter by type or domain:

```bash
paywalls receipts --type=access --domain=example.com
```

## Common Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output (all commands) |
| `--headless` | No browser, no color — for CI pipelines |
| `--base-url <url>` | Override API base URL (local dev) |
| `--force` | Overwrite existing credentials (register) |

## Troubleshooting

```bash
paywalls doctor --json
```

Doctor tells you exactly what's wrong and how to fix it. Every failure includes a `suggestedFix` with the exact CLI command to resolve it. Pass `--json` to pipe into scripts or LLM agents.

Common issues:

| Symptom | Fix |
|---------|-----|
| "No API key found" | Run `paywalls register` |
| "API unreachable" | Check internet; try `--base-url` for local dev |
| "Authentication failed" | Re-register with `paywalls register --force` |
| "No wallet found" | Run `paywalls topup` to create and fund your wallet |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PAYWALLS_API_KEY` | API key (overrides credentials file) |
| `PAYWALLS_BASE_URL` | API base URL (default: `https://api.paywalls.net`) |
| `PAYWALLS_ACCOUNT_ID` | Skip `/api/me` lookup (optional, speeds up calls) |

Configuration is resolved in this order: environment variables → `.env` file → `~/.config/paywalls/credentials.json` → inline constructor params.

## What's Next

- Browse your [transaction receipts](https://paywalls.net/docs): `paywalls receipts`
- Read the [full quickstart guide](https://paywalls.net/docs/quickstart) for the hosted walkthrough
- Check the [API reference](https://paywalls.net/docs/ai-companies/api-reference) for endpoint documentation
