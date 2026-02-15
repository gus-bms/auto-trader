export interface TradeSignalEvent {
  correlationId: string;
  symbol: string;
  timeframe: "1m" | "5m";
  timestamp: string;
  candleSnapshot: {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  };
  indicators: {
    rsi: string;
    volumeChangeRatePct: string;
  };
  orderBookSummary: {
    bidAskImbalanceRatio: string;
    spreadBps: string;
  };
  triggerType: "RSI_VOLUME_SPIKE";
  triggerScore: number;
}
