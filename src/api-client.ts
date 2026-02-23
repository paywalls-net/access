/**
 * HTTP client for core-api calls.
 *
 * Thin wrapper around global fetch that handles:
 *  - Base URL resolution
 *  - API key authentication headers
 *  - JSON parsing and error handling
 *
 * Zero external dependencies — uses Node 18+ global fetch.
 */

import { loadConfig, type PaywallsConfig } from './config.js';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export interface ApiError {
  error: string;
  message?: string;
}

export class ApiClient {
  private config: PaywallsConfig;

  constructor(overrides?: Partial<PaywallsConfig>) {
    this.config = loadConfig(overrides);
  }

  get apiKey(): string {
    return this.config.apiKey;
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Make an authenticated request to the core API.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: T;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = (await response.json()) as T;
    } else {
      const text = await response.text();
      data = { error: text || response.statusText } as T;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  async get<T = unknown>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }
}
