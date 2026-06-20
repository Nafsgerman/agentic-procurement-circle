import type { PaymentRail, PaymentResult } from "./types";

export function instrument(rail: PaymentRail): PaymentRail {
  return {
    name: rail.name,
    async init() {
      const steps = await rail.init();
      console.log(`[${rail.name}] preconditions: ${steps.length}`, steps);
      return steps;
    },
    async pay(amountUsd, memo): Promise<PaymentResult> {
      const t0 = performance.now();
      const r = await rail.pay(amountUsd, memo);
      const wall = Math.round(performance.now() - t0);
      console.log(`[${rail.name}] paid $${amountUsd} in ${wall}ms`, r);
      return { ...r, settlementMs: r.settlementMs || wall };
    },
  };
}