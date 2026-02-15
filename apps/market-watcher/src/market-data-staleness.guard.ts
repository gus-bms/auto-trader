export class MarketDataStalenessGuard {
  private readonly maxAgeMs: number;
  private readonly lastUpdatedAtBySymbol = new Map<string, number>();

  constructor(maxAgeSec: number) {
    this.maxAgeMs = maxAgeSec * 1000;
  }

  record(symbol: string, timestampMs: number): void {
    this.lastUpdatedAtBySymbol.set(symbol, timestampMs);
  }

  isSnapshotStale(snapshotTimestampMs: number, nowMs: number = Date.now()): boolean {
    return nowMs - snapshotTimestampMs > this.maxAgeMs;
  }

  isSymbolStale(symbol: string, nowMs: number = Date.now()): boolean {
    const lastUpdatedAtMs = this.lastUpdatedAtBySymbol.get(symbol);
    if (lastUpdatedAtMs === undefined) {
      return true;
    }

    return this.isSnapshotStale(lastUpdatedAtMs, nowMs);
  }

  listStaleSymbols(symbols: string[], nowMs: number = Date.now()): string[] {
    return symbols.filter((symbol) => this.isSymbolStale(symbol, nowMs));
  }
}
