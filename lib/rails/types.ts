export interface PaymentResult {
  rail: "circle" | "stripe";
  success: boolean;
  amountUsd: number;
  settlementMs: number;
  preconditions: string[];
  fraudSignal: number | null;
  reversible: boolean;
  reference: string;
  resourceData?: unknown; // the actual unlocked data, when available
}

export interface PaymentRail {
  readonly name: "circle" | "stripe";
  init(): Promise<string[]>;
  pay(amountUsd: number, memo: string): Promise<PaymentResult>;
}