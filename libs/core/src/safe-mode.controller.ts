import type { SafeModeReason } from "@app/domain";

export interface SafeModeSnapshot {
  enabled: boolean;
  reason: SafeModeReason | null;
  details: Record<string, string>;
  activatedAt: string | null;
}

export class SafeModeController {
  private state: SafeModeSnapshot = {
    enabled: false,
    reason: null,
    details: {},
    activatedAt: null
  };

  activate(reason: SafeModeReason, details: Record<string, string> = {}): SafeModeSnapshot {
    this.state = {
      enabled: true,
      reason,
      details: { ...details },
      activatedAt: new Date().toISOString()
    };

    return this.snapshot();
  }

  deactivate(): SafeModeSnapshot {
    this.state = {
      enabled: false,
      reason: null,
      details: {},
      activatedAt: null
    };

    return this.snapshot();
  }

  snapshot(): SafeModeSnapshot {
    return {
      enabled: this.state.enabled,
      reason: this.state.reason,
      details: { ...this.state.details },
      activatedAt: this.state.activatedAt
    };
  }
}
