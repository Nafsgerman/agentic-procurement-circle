import Anthropic from "@anthropic-ai/sdk";
import { tavilySearch } from "./tavily";
import type { PaymentRail, PaymentResult } from "./rails/types";

const anthropic = new Anthropic();
const MODEL = "claude-sonnet-4-6";

export interface AgentRun {
  task: string;
  research: { title: string; url: string }[];
  decision: { needsPaidData: boolean; resource: string; priceUsd: number; reason: string };
  payment: PaymentResult | null;
  answer: string;
}

export async function runAgent(task: string, rail: PaymentRail): Promise<AgentRun> {
  const research = await tavilySearch(task, 3);
  const context = research.map(r => `- ${r.title}: ${r.content}`).join("\n");

  const decisionMsg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "You are a procurement agent. Given a task and free research, decide if you need to buy a paid data/API resource to finish. " +
      "Respond ONLY with JSON: " +
      '{"needsPaidData":boolean,"resource":string,"supplierName":string,"priceUsd":number,"reason":string}. ' +
      "CRITICAL: supplierName MUST be the actual name of the single top candidate COMPANY from the research that you want to screen (e.g. \"Monoprice\", \"Texas Instruments\", \"DACHSER\") — NEVER a data provider, report name, or database (never \"Dun & Bradstreet\", \"OpenSanctions\", etc). If no specific company is identifiable, set supplierName to the most likely company name you can infer. priceUsd between 0.01 and 1.00.",
    messages: [{ role: "user", content: `Task: ${task}\n\nFree research:\n${context}` }],
  });
  const decision = safeJson(textOf(decisionMsg));

  let payment: PaymentResult | null = null;
  if (decision.needsPaidData) {
    const screenTarget = decision.supplierName && !/dun|bradstreet|opensanctions|dow jones|sayari|kharon|creditsafe|report|database|api/i.test(decision.supplierName)
      ? decision.supplierName
      : decision.supplierName || decision.resource;
    payment = await rail.pay(decision.priceUsd, screenTarget);
  }

  const answerMsg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: "Answer the task concisely from the research. If a paid screening result is provided, report ONLY what it actually says (sanctions match status, score) — do not invent credit scores, litigation history, or other risk data not present in the screening result.",
    messages: [{ role: "user", content: `Task: ${task}\n\nResearch:\n${context}\n\nPaid screening result: ${payment?.resourceData ? JSON.stringify(payment.resourceData) : "none purchased"}` }],
  });

  return {
    task,
    research: research.map(r => ({ title: r.title, url: r.url })),
    decision,
    payment,
    answer: textOf(answerMsg),
  };
}

function textOf(msg: Anthropic.Message): string {
  return msg.content.filter(b => b.type === "text").map(b => (b as any).text).join("").trim();
}
function safeJson(s: string) {
  return JSON.parse(s.replace(/```json|```/g, "").trim());
}