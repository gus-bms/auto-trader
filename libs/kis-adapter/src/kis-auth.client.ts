import { ZodError } from "zod";

import type { AuthFailureContext, CachedKisToken, KisTokenResponse } from "./kis-auth.types";
import { kisTokenResponseSchema } from "./kis-auth.types";
import { KisApiError, KisConfigError, KisNetworkError } from "./kis-errors";

export interface KisAuthClientOptions {
  appKey: string;
  appSecret: string;
  tokenUrl: string;
  requestTimeoutMs: number;
  maxRetryCount: number;
  retryBackoffMs: number;
  expirySkewSec: number;
  fetchFn?: typeof fetch;
  onAuthFailure?: (context: AuthFailureContext) => void | Promise<void>;
}

export class KisAuthClient {
  private readonly fetchFn: typeof fetch;
  private cachedToken: CachedKisToken | null = null;

  constructor(private readonly options: KisAuthClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getAccessToken(nowMs: number = Date.now()): Promise<string> {
    if (this.cachedToken !== null && nowMs < this.cachedToken.expiresAtMs) {
      return this.cachedToken.accessToken;
    }

    await this.refreshToken(nowMs);
    if (this.cachedToken === null) {
      throw new KisNetworkError("KIS token cache is empty after refresh");
    }

    return this.cachedToken.accessToken;
  }

  getCachedToken(): CachedKisToken | null {
    if (this.cachedToken === null) {
      return null;
    }

    return {
      accessToken: this.cachedToken.accessToken,
      tokenType: this.cachedToken.tokenType,
      expiresAtMs: this.cachedToken.expiresAtMs
    };
  }

  private async refreshToken(referenceNowMs: number): Promise<void> {
    this.validateCredentialInputs();

    const maxAttempts = this.options.maxRetryCount + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const tokenResponse = await this.requestToken();
        const effectiveTtlSec = Math.max(1, tokenResponse.expires_in - this.options.expirySkewSec);

        this.cachedToken = {
          accessToken: tokenResponse.access_token,
          tokenType: tokenResponse.token_type,
          expiresAtMs: referenceNowMs + effectiveTtlSec * 1000
        };

        return;
      } catch (error) {
        const normalizedError = this.normalizeError(error);
        const shouldRetry = this.shouldRetry(normalizedError) && attempt < maxAttempts;

        if (!shouldRetry) {
          await this.notifyFailure(normalizedError, attempt);
          throw normalizedError;
        }

        await sleep(this.options.retryBackoffMs * 2 ** (attempt - 1));
      }
    }
  }

  private validateCredentialInputs(): void {
    if (this.options.appKey.trim().length === 0 || this.options.appSecret.trim().length === 0) {
      throw new KisConfigError("KIS credentials are required for token refresh");
    }
  }

  private async requestToken(): Promise<KisTokenResponse> {
    const response = await this.fetchWithTimeout(this.options.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: this.options.appKey,
        appsecret: this.options.appSecret
      })
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new KisApiError(
        `KIS token endpoint returned HTTP ${response.status}`,
        response.status,
        responseBody
      );
    }

    const responseJson = (await response.json()) as unknown;
    return kisTokenResponseSchema.parse(responseJson);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, this.options.requestTimeoutMs);

    try {
      return await this.fetchFn(url, {
        ...init,
        signal: abortController.signal
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new KisNetworkError("KIS token request timed out", error);
      }

      throw new KisNetworkError("KIS token request failed", error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private shouldRetry(error: Error): boolean {
    if (error instanceof KisConfigError) {
      return false;
    }

    if (error instanceof KisApiError) {
      return error.statusCode === 429 || error.statusCode >= 500;
    }

    if (error instanceof ZodError) {
      return false;
    }

    return error instanceof KisNetworkError;
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new KisNetworkError("Unknown KIS auth error", error);
  }

  private async notifyFailure(error: Error, attempts: number): Promise<void> {
    if (this.options.onAuthFailure === undefined) {
      return;
    }

    const context: AuthFailureContext = {
      reason: "AUTH_FAILURE",
      attempts,
      statusCode: error instanceof KisApiError ? error.statusCode : null,
      message: error.message
    };

    await this.options.onAuthFailure(context);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
