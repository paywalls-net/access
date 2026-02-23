/**
 * @paywalls-net/access — Developer SDK for paywalls.net Web Content Marketplace.
 *
 * Public API:
 *  - Configuration and credentials management
 *  - API client for core-api calls
 *  - (Future) fetch() wrapper for authenticated content access
 */

export { loadConfig, saveCredentials, hasCredentials } from './config.js';
export type { PaywallsConfig } from './config.js';

export { ApiClient } from './api-client.js';
export type { ApiResponse, ApiError } from './api-client.js';
