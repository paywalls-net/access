/**
 * paywalls doctor — Diagnose configuration and connectivity.
 *
 * Checks:
 *  - API key is configured (env → .env → credentials file)
 *  - API key is valid (calls /api/me)
 *  - Wallet exists and has balance
 *  - Can reach access.paywalls.net proxy
 */
export async function doctor(_args: string[]): Promise<void> {
  console.log('paywalls doctor — not yet implemented');
  console.log('');
  console.log('This will diagnose your configuration and connectivity:');
  console.log('  ✓ API key configured');
  console.log('  ✓ API key valid');
  console.log('  ✓ Wallet exists');
  console.log('  ✓ Proxy reachable');
}
