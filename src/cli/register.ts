/**
 * paywalls register — Device-code registration flow.
 *
 * 1. POST /api/device/code → get code + verification URL
 * 2. Open browser to verification URL
 * 3. Poll POST /api/device/token until approved or expired
 * 4. Save API key to credentials file
 */
export async function register(_args: string[]): Promise<void> {
  console.log('paywalls register — not yet implemented');
  console.log('');
  console.log('This will:');
  console.log('  1. Request a device code from paywalls.net');
  console.log('  2. Open your browser to authorize the device');
  console.log('  3. Poll for approval and save your API key');
}
