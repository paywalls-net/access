# @paywalls-net/access

Developer SDK and CLI for the [paywalls.net](https://paywalls.net) Web Content Marketplace — wallet-backed content access for AI agents.

## Quick Start

```bash
# Register a device and get an API key
npx @paywalls-net/access register

# Check your wallet balance
npx @paywalls-net/access balance

# Diagnose configuration issues
npx @paywalls-net/access doctor
```

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

## SDK Usage (Coming Soon)

```typescript
import { ApiClient } from '@paywalls-net/access';

const client = new ApiClient({ apiKey: process.env.PAYWALLS_API_KEY });
const { data } = await client.get('/api/wallet/balance');
console.log(data);
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

## License

MIT
