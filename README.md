[paste the above markdown content here]
# Agentic Procurement — Circle x402 Track

An autonomous procurement agent that researches suppliers, decides for itself
when free information isn't enough, and pays for premium data with real USDC —
no human in the loop for the payment decision or the transaction.

## What it actually does

1. You give it a procurement task (e.g. "cheapest reliable supplier of
   industrial-grade USB-C cables, 10,000 units").
2. The agent researches via **Tavily** web search.
3. Claude (claude-sonnet-4-6) reads the research and decides whether the free
   results are sufficient or whether a paid compliance/sanctions check is
   needed — and if so, extracts the actual candidate company name to screen.
4. If it decides to pay, the agent calls `/api/paid`, gets a `402 Payment
   Required` challenge back with the price and merchant address, and pays via
   **Circle Developer-Controlled Wallets** — a real USDC transfer on
   **ETH-SEPOLIA** testnet.
5. `/api/paid` verifies the Circle transaction actually settled — correct
   merchant address, correct amount, correct asset, confirmed on-chain state —
   before unlocking anything. A fake or reused `X-PAYMENT` reference is
   rejected (402 for invalid, 409 for replay).
6. Once verified, `/api/paid` runs a live **OpenSanctions** screening of the
   company and returns the real result, including the on-chain transaction
   hash as proof of payment.
7. Claude writes the final recommendation grounded only in what the screening
   actually returned — it does not fabricate financial, credit, or litigation
   data the API didn't provide.

This is a real x402-style flow (HTTP 402 challenge → pay → re-request) with
real on-chain settlement — not a mocked payment or a hardcoded "yes you paid"
flag.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Anthropic SDK** — Claude (claude-sonnet-4-6) for agent reasoning and the
  pay/don't-pay decision
- **Tavily** — live web research
- **Circle Developer-Controlled Wallets SDK** — real USDC settlement on
  ETH-SEPOLIA
- **OpenSanctions API** — real sanctions/watchlist screening

## Architecture

[alt text](image.png)

- `lib/rails/types.ts` — `PaymentRail` interface (`init`, `pay`) and
  `PaymentResult` type. Designed so additional rails (e.g. Stripe) can
  implement the same interface for a head-to-head comparison.
- `lib/rails/circle.ts` — the Circle rail: wallet provisioning, the `pay()`
  flow (challenge → transfer → re-request), and `verifyCirclePayment()`, which
  polls Circle's `getTransaction` until a terminal state and checks
  destination address, amount, asset, and chain before anything is unlocked.
- `lib/rails/metrics.ts` — `instrument()` decorator wrapping a rail to capture
  timing/outcome metrics per payment.
- `lib/agent.ts` — the agent loop: research → pay/don't-pay decision → paid
  data retrieval → grounded final answer.
- `app/api/agent/route.ts` — orchestrates a single procurement run.
- `app/api/paid/route.ts` — the paywalled resource: returns `402` with payment
  terms when unpaid, verifies the Circle transaction when `X-PAYMENT` is
  present, and only then calls OpenSanctions and returns the screening.

## Running it

```bash
npm install
npm run dev
```

Required `.env.local`:
ANTHROPIC_API_KEY=

TAVILY_API_KEY=

CIRCLE_API_KEY=

CIRCLE_ENTITY_SECRET=

CIRCLE_WALLET_ID=

CIRCLE_MERCHANT_ADDRESS=

CIRCLE_USDC_TOKEN_ID=5797fbd6-3795-519d-84ca-ec4c5f80c3b1

OPENSANCTIONS_API_KEY=

PAID_PRICE_USDC=0.99

PAID_CHAIN=ETH-SEPOLIA

NEXT_PUBLIC_BASE_URL=http://localhost:3000

The Circle wallet needs testnet USDC and ETH-SEPOLIA gas before it can pay —
fund it via the [Circle faucet](https://faucet.circle.com) (select Ethereum
Sepolia, use the wallet's on-chain address, not the wallet ID).

## Demo Boundaries

**Resolved this session:** `/api/paid` now verifies the Circle transaction's
state, destination, amount, and asset on-chain before unlocking screening data.
Tampered or replayed payment references are rejected (402/409).

**Deliberate scope choice:** This implements an x402-style 402-challenge /
pay / re-request flow with real on-chain settlement, not the full x402 protocol's
EIP-3009 facilitator handshake. Out of scope for the hackathon timebox — the
current flow is simpler (agent submits a transfer, then re-requests with the
tx id) and was a conscious tradeoff, not an oversight.

**Minor, known limitation:** the redeemed-payment cache is in-memory and resets
on server restart. Fine for a demo session; a production version would persist
it (Redis/DB).

## Repo

github.com/Nafsgerman/agentic-procurement-circle