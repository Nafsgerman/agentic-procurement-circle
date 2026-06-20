import { NextRequest, NextResponse } from "next/server";

const settled = new Set<string>();
const PRICE_USD = "0.05";
const ASSET = "USDC";
const PAY_TO = process.env.CIRCLE_MERCHANT_ADDRESS || "0x000000000000000000000000000000000000dead";
const NETWORK = "base-sepolia";

export async function GET(req: NextRequest) {
  const paymentRef = req.headers.get("x-payment");
  const supplierName = req.nextUrl.searchParams.get("supplier") ?? "";

  if (!paymentRef) {
    return NextResponse.json({ asset: ASSET, amount: PRICE_USD, payTo: PAY_TO, network: NETWORK }, { status: 402 });
  }
  if (settled.has(paymentRef)) {
    return NextResponse.json({ error: "payment already redeemed" }, { status: 409 });
  }
  settled.add(paymentRef);

  if (!supplierName) {
    return NextResponse.json({ error: "supplier query param required" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.opensanctions.org/match/sanctions", {
      method: "POST",
      headers: {
        "Authorization": `ApiKey ${process.env.OPENSANCTIONS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queries: {
          q: {
            schema: "Organization",
            properties: { name: [supplierName] },
          },
        },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "screening service error", status: res.status }, { status: 502 });
    }

    const data = await res.json();
    const results = data.responses?.q?.results ?? [];
    const topMatch = results[0];
    const flagged = topMatch && topMatch.score > 0.7;

    return NextResponse.json({
      resource: "opensanctions-screening",
      query: supplierName,
      sanctionsFlag: Boolean(flagged),
      matchCount: results.length,
      topMatch: topMatch ? { caption: topMatch.caption, score: topMatch.score, id: topMatch.id } : null,
      checkedAgainst: "OpenSanctions consolidated sanctions datasets",
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "screening unavailable", detail: e.message }, { status: 502 });
  }
}
