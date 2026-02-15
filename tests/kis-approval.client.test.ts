import assert from "node:assert/strict";
import test from "node:test";

import { KisApiError, KisApprovalClient, KisConfigError } from "../libs/kis-adapter/src";

test("returns approval key on successful response", async () => {
  let requestCount = 0;

  const approvalClient = new KisApprovalClient({
    appKey: "app-key",
    appSecret: "app-secret",
    approvalUrl: "https://example.com/approval",
    requestTimeoutMs: 1000,
    maxRetryCount: 0,
    retryBackoffMs: 0,
    fetchFn: async () => {
      requestCount += 1;
      return createJsonResponse({ approval_key: "approval-123" }, 200);
    }
  });

  const approvalKey = await approvalClient.getApprovalKey();

  assert.equal(approvalKey, "approval-123");
  assert.equal(requestCount, 1);
});

test("retries approval request on server error", async () => {
  let requestCount = 0;

  const approvalClient = new KisApprovalClient({
    appKey: "app-key",
    appSecret: "app-secret",
    approvalUrl: "https://example.com/approval",
    requestTimeoutMs: 1000,
    maxRetryCount: 2,
    retryBackoffMs: 0,
    fetchFn: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return createJsonResponse({ message: "temporary failure" }, 500);
      }

      return createJsonResponse({ approval_key: "approval-retry" }, 200);
    }
  });

  const approvalKey = await approvalClient.getApprovalKey();

  assert.equal(approvalKey, "approval-retry");
  assert.equal(requestCount, 2);
});

test("fails fast on 4xx response", async () => {
  let requestCount = 0;

  const approvalClient = new KisApprovalClient({
    appKey: "app-key",
    appSecret: "app-secret",
    approvalUrl: "https://example.com/approval",
    requestTimeoutMs: 1000,
    maxRetryCount: 2,
    retryBackoffMs: 0,
    fetchFn: async () => {
      requestCount += 1;
      return createJsonResponse({ message: "bad request" }, 400);
    }
  });

  await assert.rejects(async () => approvalClient.getApprovalKey(), (error: unknown) => {
    assert.ok(error instanceof KisApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });

  assert.equal(requestCount, 1);
});

test("throws config error when credentials are missing", async () => {
  const approvalClient = new KisApprovalClient({
    appKey: "",
    appSecret: "",
    approvalUrl: "https://example.com/approval",
    requestTimeoutMs: 1000,
    maxRetryCount: 0,
    retryBackoffMs: 0,
    fetchFn: async () => createJsonResponse({ approval_key: "ignored" }, 200)
  });

  await assert.rejects(async () => approvalClient.getApprovalKey(), (error: unknown) => {
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
