import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { PaymentRail, PaymentResult } from "./types";

const USDC_TOKEN_ID_ETH_SEPOLIA = "5797fbd6-3795-519d-84ca-ec4c5f80c3b1";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// ---- payment verification (gate) ----
// In-block = paid. Accepting CONFIRMED (not just COMPLETE) is a deliberate demo choice:
// a tx in a block has settled for paywall purposes. Set ACCEPTED_STATES to COMPLETE-only for strict finality.
const ACCEPTED_STATES = new Set(["COMPLETE", "CONFIRMED"]);
const TERMINAL_FAIL = new Set(["FAILED", "DENIED", "CANCELLED"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PaymentCheck =
  | { ok: true; txHash: string; amount: string; state: string }
  | { ok: false; status: number; reason: string };

/**
 * Verifies a Circle transaction actually settled to the merchant for the right
 * amount/asset/chain before any data is unlocked. Polls in-flight txs up to ~24s.
 */
export async function verifyCirclePayment(txId: string): Promise<PaymentCheck> {
  const merchant = (process.env.CIRCLE_MERCHANT_ADDRESS ?? "").toLowerCase();
  const requiredUsdc = parseFloat(process.env.PAID_PRICE_USDC ?? "0.05");
  const expectedChain = process.env.PAID_CHAIN ?? "ETH-SEPOLIA";
  const expectedTokenId = process.env.CIRCLE_USDC_TOKEN_ID; // optional strict-asset check

  if (!merchant) return { ok: false, status: 500, reason: "CIRCLE_MERCHANT_ADDRESS not set" };

  let tx: any = null;
  for (let i = 0; i < 12; i++) {
    try {
      const res = await client.getTransaction({ id: txId });
      tx = res.data?.transaction ?? null;
    } catch {
      return { ok: false, status: 402, reason: "Unknown transaction id" };
    }
    if (!tx) return { ok: false, status: 402, reason: "Unknown transaction id" };
    if (ACCEPTED_STATES.has(tx.state)) break;
    if (TERMINAL_FAIL.has(tx.state)) return { ok: false, status: 402, reason: `Payment ${tx.state}` };
    await sleep(2000); // still in-flight (INITIATED/QUEUED/SENT/...)
  }

  if (!tx || !ACCEPTED_STATES.has(tx.state))
    return { ok: false, status: 402, reason: "Payment not confirmed in time" };
  if ((tx.destinationAddress ?? "").toLowerCase() !== merchant)
    return { ok: false, status: 402, reason: "Wrong merchant address" };
  if (tx.blockchain && tx.blockchain !== expectedChain)
    return { ok: false, status: 402, reason: `Wrong chain: ${tx.blockchain}` };

  const paid = parseFloat(tx.amounts?.[0] ?? "0");
  if (!(paid + 1e-9 >= requiredUsdc))
    return { ok: false, status: 402, reason: `Underpaid: ${paid} < ${requiredUsdc}` };
  if (expectedTokenId && tx.tokenId !== expectedTokenId)
    return { ok: false, status: 402, reason: "Wrong asset (not USDC)" };

  return { ok: true, txHash: tx.txHash ?? "", amount: String(paid), state: tx.state };
}

// ---- payment rail ----
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

      let transferRes;
      try {
        transferRes = await client.createTransaction({
          walletId,
          tokenId: USDC_TOKEN_ID_ETH_SEPOLIA,
          destinationAddress: terms.payTo,
          amount: [String(amountUsd)],
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });
      } catch (e: any) {
        const reason = e?.response?.data?.message ?? e?.message ?? "transfer rejected";
        return {
          rail: "circle",
          success: false,
          amountUsd,
          settlementMs: Math.round(performance.now() - t0),
          preconditions: [],
          fraudSignal: null,
          reversible: false,
          reference: `transfer-failed: ${reason}`,
        };
      }

      const submitMs = Math.round(performance.now() - t0);
      const txId = transferRes.data?.id ?? "unknown";

      if (!transferRes.data?.id) {
        return {
          rail: "circle",
          success: false,
          amountUsd,
          settlementMs: submitMs,
          preconditions: [],
          fraudSignal: null,
          reversible: false,
          reference: "transfer-failed: no transaction id returned",
        };
      }

      const settleRes = await fetch(resourceUrl, { headers: { "X-PAYMENT": txId } });
      const confirmMs = Math.round(performance.now() - t0);

      let resourceData: any = null;
      let settleErrorBody: string | null = null;
      if (settleRes.ok) {
        resourceData = await settleRes.json();
      } else {
        settleErrorBody = await settleRes.text().catch(() => settleRes.statusText);
      }

      return {
        rail: "circle",
        success: settleRes.ok && resourceData != null,
        amountUsd,
        settlementMs: confirmMs,
        submitMs,
        preconditions: [],
        fraudSignal: null,
        reversible: false,
        reference: settleRes.ok ? txId : `paid-but-unlock-failed (${settleRes.status}): ${settleErrorBody}`,
        resourceData,
      };
    },
  };
}