# Getting Started with @paywalls-net/access

> 5-minute guide to wallet-backed content access for AI agents.

## 1. Install

```bash
npm install @paywalls-net/access
```

Or skip the install entirely — every command works with `npx`:

```bash
npx @paywalls-net/access --help
```

## 2. Register

```bash
npx @paywalls-net/access register
```

This opens your browser. Approve the device code to create (or link) your account. Your API key is saved to `~/.config/paywalls/credentials.json` automatically.

> **CI / headless?** Add `--headless` — you'll get a URL to open manually.

## 3. Check Your Setup

```bash
npx @paywalls-net/access doctor
```

All five checks should pass: configuration, connectivity, authentication, wallet, and agent.

## 4. Fund Your Wallet

```bash
npx @paywalls-net/access topup
```

Check your balance anytime:

```bash
npx @paywalls-net/access balance
```

## 5. Use in Your App

Set the env var so your app picks up the key:

```bash
export PAYWALLS_API_KEY=$(jq -r .api_key ~/.config/paywalls/credentials.json)
```

Or reference the credentials file directly in code:

```typescript
import { ApiClient } from '@paywalls-net/access';

const client = new ApiClient();        // auto-loads credentials
const page = await client.get('/access/https://example.com/article');
console.log(page.data);
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
npx @paywalls-net/access doctor --json
```

Doctor tells you exactly what's wrong and how to fix it. Pass `--json` to pipe into scripts or LLM agents.

## Receipts

```bash
npx @paywalls-net/access receipts              # recent transactions
npx @paywalls-net/access receipts --limit=5    # last 5
npx @paywalls-net/access receipts <id>         # single receipt detail
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PAYWALLS_API_KEY` | API key (overrides credentials file) |
| `PAYWALLS_BASE_URL` | API base URL (default: `https://api.paywalls.net`) |
| `PAYWALLS_ACCOUNT_ID` | Skip `/api/me` lookup (optional, speeds up calls) |

## What's Next

- Register an agent: `paywalls agent register --name "my-agent"` *(coming soon)*
- Use the proxy: `fetch('https://access.paywalls.net/https://example.com/article', { headers: { Authorization: 'Bearer <token>' } })` *(coming soon)*
- Check the [full API docs](https://paywalls.net/docs)
