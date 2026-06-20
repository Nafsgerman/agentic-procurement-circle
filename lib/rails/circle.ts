import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { PaymentRail, PaymentResult } from "./types";

const USDC_TOKEN_ID_ETH_SEPOLIA = "5797fbd6-3795-519d-84ca-ec4c5f80c3b1";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

export function circleRail(): PaymentRail {
  let walletId = process.env.CIRCLE_WALLET_ID || "";

  return {
    name: "circle",

    async init(): Promise<string[]> {
      const steps: string[] = [];

      if (!walletId) {
        const walletSetRes = await client.createWalletSet({ name: "agentic-procurement" });
        const walletSetId = walletSetRes.data?.walletSet?.id;
        if (!walletSetId) throw new Error("Failed to create wallet set");
        steps.push("created wallet set");

        const walletsRes = await client.createWallets({
          blockchains: ["ETH-SEPOLIA"],
          count: 1,
          walletSetId,
        });
        walletId = walletsRes.data?.wallets?.[0]?.id ?? "";
        if (!walletId) throw new Error("Failed to create wallet");
        steps.push("provisioned developer-controlled wallet on ETH-SEPOLIA");
        steps.push(`wallet id: ${walletId} — save this to CIRCLE_WALLET_ID in .env.local`);
      } else {
        steps.push("reused existing wallet id from env");
      }

      steps.push("NOTE: wallet needs testnet USDC — fund via Circle faucet before paying");
      return steps;
    },

    async pay(amountUsd: number, memo: string): Promise<PaymentResult> {
      const t0 = performance.now();
      const resourceUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/paid?supplier=${encodeURIComponent(memo)}`;

      const challengeRes = await fetch(resourceUrl);
      if (challengeRes.status !== 402) {
        throw new Error(`Expected 402 challenge from ${resourceUrl}, got ${challengeRes.status}`);
      }
      const terms = await challengeRes.json();

      const transferRes = await client.createTransaction({
        walletId,
        tokenId: USDC_TOKEN_ID_ETH_SEPOLIA,
        destinationAddress: terms.payTo,
        amount: [String(amountUsd)],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });

      const settlementMs = Math.round(performance.now() - t0);
      const txId = transferRes.data?.id ?? "unknown";

      if (!transferRes.data?.id) {
        return {
          rail: "circle",
          success: false,
          amountUsd,
          settlementMs,
          preconditions: [],
          fraudSignal: null,
          reversible: false,
          reference: "transfer-failed",
        };
      }

      const settleRes = await fetch(resourceUrl, { headers: { "X-PAYMENT": txId } });
      const resourceData = settleRes.ok ? await settleRes.json() : null;

      return {
        rail: "circle",
        success: settleRes.ok,
        amountUsd,
        settlementMs,
        preconditions: [],
        fraudSignal: null,
        reversible: false,
        reference: txId,
        resourceData,
      };
    },
  };
}