import { register } from './register.js';
import { balance } from './balance.js';
import { topup } from './topup.js';
import { receipts } from './receipts.js';
import { doctor } from './doctor.js';

const commands: Record<string, (args: string[]) => Promise<void>> = {
  register,
  balance,
  topup,
  fund: topup,
  receipts,
  doctor,
};

function printHelp(): void {
  console.log(`
paywalls — Developer CLI for paywalls.net Web Content Marketplace

Usage: paywalls <command> [options]

Commands:
  register    Register a new device and obtain an API key
  balance     Check your wallet balance
  topup       Add funds to your wallet (alias: fund)
  receipts    View recent transaction receipts
  doctor      Diagnose configuration and connectivity issues

Options:
  --help      Show this help message
  --version   Show version
  --headless  Disable color, browser auto-open, and interactive prompts
  --json      Output machine-readable JSON (implies --headless)

Get started:
  paywalls register
  paywalls balance
`.trim());
}

function printVersion(): void {
  // Read version from package.json at runtime
  console.log('0.1.0');
}

export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-v') {
    printVersion();
    return;
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run 'paywalls --help' for available commands.`);
    process.exit(1);
  }

  await handler(args.slice(1));
}
