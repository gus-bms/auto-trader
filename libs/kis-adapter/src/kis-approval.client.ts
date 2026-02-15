import { ZodError } from "zod";

import { KisApiError, KisConfigError, KisNetworkError } from "./kis-errors";
import { kisApprovalResponseSchema, type KisApprovalResponse } from "./kis-approval.types";

export interface KisApprovalClientOptions {
  appKey: string;
  appSecret: string;
  approvalUrl: string;
  requestTimeoutMs: number;
  maxRetryCount: number;
  retryBackoffMs: number;
  fetchFn?: typeof fetch;
}

export class KisApprovalClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: KisApprovalClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getApprovalKey(): Promise<string> {
    this.validateCredentialInputs();

    const maxAttempts = this.options.maxRetryCount + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.requestApproval();
        return response.approval_key;
      } catch (error) {
        const normalizedError = this.normalizeError(error);
        const shouldRetry = this.shouldRetry(normalizedError) && attempt < maxAttempts;
        if (!shouldRetry) {
          throw normalizedError;
        }

        await sleep(this.options.retryBackoffMs * 2 ** (attempt - 1));
      }
    }

    throw new KisNetworkError("KIS approval key request exhausted retries");
  }

  private validateCredentialInputs(): void {
    if (this.options.appKey.trim().length === 0 || this.options.appSecret.trim().length === 0) {
      throw new KisConfigError("KIS credentials are required for approval key issuance");
    }
  }

  private async requestApproval(): Promise<KisApprovalResponse> {
    const response = await this.fetchWithTimeout(this.options.approvalUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: this.options.appKey,
        secretkey: this.options.appSecret
      })
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new KisApiError(
        `KIS approval endpoint returned HTTP ${response.status}`,
        response.status,
        responseBody
      );
    }

    const responseJson = (await response.json()) as unknown;
    return kisApprovalResponseSchema.parse(responseJson);
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
        throw new KisNetworkError("KIS approval key request timed out", error);
      }

      throw new KisNetworkError("KIS approval key request failed", error);
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

    return new KisNetworkError("Unknown KIS approval key error", error);
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
