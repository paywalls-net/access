/**
 * paywalls topup — Add funds to wallet.
 *
 * V0: Displays instructions for manual funding or test mode.
 * V1: Integrates with Stripe checkout.
 *
 * Aliases: `paywalls fund`
 */

import { parseFlags } from './util.js';
import { info } from './output.js';

export async function topup(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const jsonMode = flags.json === true;

  if (jsonMode) {
    console.log(JSON.stringify({
      error: 'Not yet implemented.',
      resolution: 'Visit https://paywalls.net to add funds.',
    }));
    return;
  }

  info('paywalls topup — not yet implemented');
  info('');
  info('This will allow you to add funds to your wallet.');
  info('Visit https://paywalls.net to add funds in the meantime.');
}
