"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentRun } from "@/lib/agent";

export default function Home() {
  const [task, setTask] = useState(
    "Find the cheapest reliable supplier of industrial-grade USB-C cables for a 10,000-unit order, and check their risk profile before recommending them."
  );
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      if (!res.ok) throw new Error(await res.text());
      const run: AgentRun = await res.json();
      setRuns((prev) => [run, ...prev]);
      setOpenIndex(0);
    } catch (e: any) {
      setError(e.message ?? "agent run failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Agentic Procurement</h1>
        <p className="text-sm text-gray-500 mb-6">
          Agent researches via Tavily, decides when to pay for premium data, settles autonomously via x402 + Circle USDC.
        </p>

        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />

        <button
          onClick={handleRun}
          disabled={loading}
          className="mt-3 bg-[#1a73e8] text-white px-5 py-2 rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
        >
          {loading ? "Agent working…" : "Run agent"}
        </button>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        {runs.length > 1 && <SettlementChart runs={runs} />}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {runs.map((run, i) => (
            <RunCard
              key={i}
              run={run}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function shortTitle(task: string): string {
  // Pull the core subject out of the task sentence for a compact card title
  const cleaned = task.replace(/^Find( a| the)?\s*/i, "").replace(/^Identify( the)?\s*/i, "").replace(/^Source( a)?\s*/i, "").replace(/^Evaluate\s*/i, "");
  return cleaned.length > 60 ? cleaned.slice(0, 60).trim() + "…" : cleaned;
}

function RunCard({ run, isOpen, onToggle }: { run: AgentRun; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex flex-col ${isOpen ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{shortTitle(run.task)}</h3>
          <ChevronIcon open={isOpen} />
        </div>
        {run.payment && (
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${run.payment.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              ${run.payment.amountUsd} via {run.payment.rail}
            </span>
            <span className="text-xs text-gray-400">{run.payment.settlementMs}ms</span>
          </div>
        )}
        {!isOpen && (
          <p className="mt-2 text-xs text-gray-500 line-clamp-2">{run.decision.resource}</p>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <Section title="Research">
            <ul className="text-sm text-gray-700 space-y-1">
              {run.research.map((r, i) => (
                <li key={i}>
                  <a href={r.url} target="_blank" className="text-blue-600 hover:underline">{r.title}</a>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Why it paid">
            <p className="text-sm text-gray-700">{run.decision.reason}</p>
          </Section>

          {run.payment && (
            <Section title="Payment detail">
              <dl className="text-sm grid grid-cols-2 gap-1">
                <dt className="text-gray-500">Reference</dt><dd className="truncate">{run.payment.reference}</dd>
                <dt className="text-gray-500">Reversible</dt><dd>{String(run.payment.reversible)}</dd>
              </dl>
            </Section>
          )}

          <Section title="Answer">
            <div className="text-sm text-gray-800 prose prose-sm max-w-none prose-table:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.answer}</ReactMarkdown>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SettlementChart({ runs }: { runs: AgentRun[] }) {
  const data = runs.filter((r) => r.payment).map((r, i) => ({ label: `#${runs.length - i}`, ms: r.payment!.settlementMs })).reverse();
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.ms), 1);

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Settlement time across runs</h3>
      <div className="flex items-end gap-3 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-gray-600">{d.ms}ms</span>
            <div className="w-full bg-[#1a73e8] rounded-t" style={{ height: `${Math.max((d.ms / max) * 100, 4)}%` }} />
            <span className="text-xs text-gray-400">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}