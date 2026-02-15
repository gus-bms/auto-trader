import assert from "node:assert/strict";
import test from "node:test";

import { MarketDataStalenessGuard } from "../apps/market-watcher/src/market-data-staleness.guard";

test("treats unseen symbols as stale and fresh after record", () => {
  const guard = new MarketDataStalenessGuard(60);
  const nowMs = 1_000_000;

  assert.equal(guard.isSymbolStale("SOXL", nowMs), true);

  guard.record("SOXL", nowMs - 30_000);

  assert.equal(guard.isSymbolStale("SOXL", nowMs), false);
});

test("flags symbol stale when last update exceeds max age", () => {
  const guard = new MarketDataStalenessGuard(60);
  const nowMs = 1_000_000;

  guard.record("TQQQ", nowMs - 61_000);

  assert.equal(guard.isSymbolStale("TQQQ", nowMs), true);
});

test("lists stale symbols across configured universe", () => {
  const guard = new MarketDataStalenessGuard(60);
  const nowMs = 1_000_000;

  guard.record("SOXL", nowMs - 10_000);
  guard.record("TQQQ", nowMs - 80_000);

  const staleSymbols = guard.listStaleSymbols(["SOXL", "TQQQ", "TSLA"], nowMs);

  assert.deepEqual(staleSymbols, ["TQQQ", "TSLA"]);
});
