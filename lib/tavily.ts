export interface TavilyResult { title: string; url: string; content: string; }

export async function tavilySearch(query: string, maxResults = 3): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({ title: r.title, url: r.url, content: r.content }));
}