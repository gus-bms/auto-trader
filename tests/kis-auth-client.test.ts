import assert from "node:assert/strict";
import test from "node:test";

import { KisApiError, KisAuthClient, KisConfigError } from "../libs/kis-adapter/src";

test("returns cached token while token is still valid", async () => {
  let requestCount = 0;

  const authClient = new KisAuthClient({
    appKey: "app-key",
    appSecret: "app-secret",
    tokenUrl: "https://example.com/token",
    requestTimeoutMs: 1000,
    maxRetryCount: 0,
    retryBackoffMs: 0,
    expirySkewSec: 30,
    fetchFn: async () => {
      requestCount += 1;

      return createJsonResponse(
        {
          access_token: "cached-token",
          token_type: "Bearer",
          expires_in: 300
        },
        200
      );
    }
  });

  const firstToken = await authClient.getAccessToken(1_000_000);
  const secondToken = await authClient.getAccessToken(1_100_000);

  assert.equal(firstToken, "cached-token");
  assert.equal(secondToken, "cached-token");
  assert.equal(requestCount, 1);
});

test("retries on server errors and succeeds on later attempt", async () => {
  let requestCount = 0;

  const authClient = new KisAuthClient({
    appKey: "app-key",
    appSecret: "app-secret",
    tokenUrl: "https://example.com/token",
    requestTimeoutMs: 1000,
    maxRetryCount: 2,
    retryBackoffMs: 0,
    expirySkewSec: 30,
    fetchFn: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return createJsonResponse({ message: "temporary failure" }, 500);
      }

      return createJsonResponse(
        {
          access_token: "retried-token",
          token_type: "Bearer",
          expires_in: 300
        },
        200
      );
    }
  });

  const token = await authClient.getAccessToken(1_000_000);

  assert.equal(token, "retried-token");
  assert.equal(requestCount, 2);
});

test("fails fast on 4xx and invokes auth failure callback", async () => {
  let requestCount = 0;
  const failureContexts: Array<{ attempts: number; statusCode: number | null }> = [];

  const authClient = new KisAuthClient({
    appKey: "app-key",
    appSecret: "app-secret",
    tokenUrl: "https://example.com/token",
    requestTimeoutMs: 1000,
    maxRetryCount: 2,
    retryBackoffMs: 0,
    expirySkewSec: 30,
    onAuthFailure: (context) => {
      failureContexts.push({
        attempts: context.attempts,
        statusCode: context.statusCode
      });
    },
    fetchFn: async () => {
      requestCount += 1;
      return createJsonResponse({ message: "bad request" }, 400);
    }
  });

  await assert.rejects(async () => authClient.getAccessToken(1_000_000), (error: unknown) => {
    assert.ok(error instanceof KisApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(failureContexts, [{ attempts: 1, statusCode: 400 }]);
});

test("throws configuration error if KIS credentials are missing", async () => {
  const authClient = new KisAuthClient({
    appKey: "",
    appSecret: "",
    tokenUrl: "https://example.com/token",
    requestTimeoutMs: 1000,
    maxRetryCount: 0,
    retryBackoffMs: 0,
    expirySkewSec: 30,
    fetchFn: async () => createJsonResponse({}, 200)
  });

  await assert.rejects(async () => authClient.getAccessToken(1_000_000), (error: unknown) => {
    assert.ok(error instanceof KisConfigError);
    return true;
  });
});

function createJsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
