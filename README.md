# @paywalls-net/access
Developer SDK and CLI for the [paywalls.net](https://paywalls.net) Web Content Marketplace — wallet-backed content access for AI agents.

Fetch articles, pages, and other publisher content that is cleaned, optimized for LLM consumption, and fully licensed. No scraping, no legal gray areas — every response is a legitimate content transaction between your wallet and the publisher.

> **New here?** Follow the [Quickstart Guide](https://paywalls.net/docs/quickstart) to go from zero to your first licensed fetch in under 5 minutes.

## Quick Start

```bash
# 1. Install
npm install -g @paywalls-net/access

# 2. Register your device (opens browser for approval)
paywalls register

# 3. Verify everything works
paywalls doctor

# 4. Fund your wallet
paywalls topup

# 5. Check your balance
paywalls balance
```

Then use the SDK in your code:

```typescript
import { ApiClient } from '@paywalls-net/access';

const client = new ApiClient();  // auto-loads credentials
const page = await client.get('/access/https://example.com/article');
console.log(page.data);         // licensed content
```

See the full [Getting Started guide](getting-started.md) for detailed output examples and troubleshooting.

## Installation

```bash
# Global install (adds `paywalls` to PATH)
npm install -g @paywalls-net/access

# Or use npx (no install required)
npx @paywalls-net/access <command>

# Or add to your project
npm install @paywalls-net/access
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `paywalls register` | Register a new device and obtain an API key |
| `paywalls balance` | Check your wallet balance |
| `paywalls topup` | Add funds to your wallet (alias: `fund`) |
| `paywalls receipts` | View recent transaction receipts |
| `paywalls doctor` | Diagnose configuration and connectivity |

## Configuration

Credentials are resolved in this order:

1. **Environment variables**: `PAYWALLS_API_KEY`, `PAYWALLS_BASE_URL`
2. **`.env` file** in current directory
3. **Credentials file**: `~/.config/paywalls/credentials.json`

The credentials file is created automatically by `paywalls register`:

```json
{
  "api_key": "FL0QCW-01-MLYIB66U",
  "account_id": "ABUI8C-01-MLYIB66L",
  "base_url": "https://api.paywalls.net"
}
```

## SDK Usage

```typescript
import { ApiClient } from '@paywalls-net/access';

const client = new ApiClient();  // auto-loads credentials from file, env, or .env

// Check balance
const balance = await client.get('/api/wallet/balance');
console.log(balance.data);  // { balance: 500000, currency: 'USD' }

// Fetch licensed content
const page = await client.get('/access/https://example.com/article');
console.log(page.ok);    // true
console.log(page.data);  // article content
```

### Configuration

```typescript
// Explicit config (overrides credential file)
const client = new ApiClient({
  apiKey: process.env.PAYWALLS_API_KEY,
  baseUrl: 'https://api.paywalls.net',
});
```

## Development

```bash
git clone git@github.com:paywalls-net/access.git
cd access
npm install
npm run build           # compile TypeScript
npm run dev             # watch mode
npm test                # run tests

# Test against local core-api
node bin/paywalls.js register --base-url http://localhost:3000
```

## Documentation

- [Quickstart Guide](https://paywalls.net/docs/quickstart) — zero to first licensed fetch in 5 minutes
- [Getting Started](getting-started.md) — detailed CLI walkthrough with expected outputs
- [API Reference](https://paywalls.net/docs/ai-companies/api-reference) — endpoint documentation

## License

MIT
