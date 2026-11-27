/**
 * JUVAO DuckDuckGo Search Worker
 *
 * Deploy this file as a Cloudflare Worker.
 * Add a Worker secret named JUVAO_SEARCH_SECRET.
 * Set the same secret and the deployed Worker URL in Vercel.
 */

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      !url.hostname.endsWith("duckduckgo.com");
  } catch {
    return false;
  }
}

function extractResults(html) {
  const blocks = html.split(/(?=<div\b[^>]*class=["'][^"']*result(?:\s|["'])|<tr\b[^>]*class=["'][^"']*result)/i);
  const results = [];

  for (const block of blocks) {
    const link = block.match(/<a\b[^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;

    let target = decodeHtml(link[1].trim());
    try {
      if (target.startsWith("//")) target = "https:" + target;
      const parsed = new URL(target, "https://duckduckgo.com");
      if (parsed.hostname.endsWith("duckduckgo.com") && ["/l/", "/"].includes(parsed.pathname)) {
        target = parsed.searchParams.get("uddg") || parsed.searchParams.get("url") || "";
      } else {
        target = parsed.toString();
      }
    } catch {
      continue;
    }

    if (!safeUrl(target)) continue;
    const title = stripHtml(link[2]).slice(0, 180);
    if (!title) continue;
    const snippetMatch = block.match(/class=["'][^"']*(?:result__snippet|result-snippet|snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
    const item = {
      title,
      url: target,
      snippet: snippetMatch ? stripHtml(snippetMatch[1]).slice(0, 1800) : "",
    };
    if (!results.some((entry) => entry.url === item.url)) results.push(item);
    if (results.length === 5) break;
  }
  return results;
}

async function searchDuckDuckGo(query) {
  const endpoints = [
    "https://html.duckduckgo.com/html/",
    "https://lite.duckduckgo.com/lite/",
  ];

  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.searchParams.set("q", query.slice(0, 500));
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,uz;q=0.8",
        "Referer": "https://duckduckgo.com/",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.warn("[JUVAO DDG Worker] DDG HTTP", response.status, endpoint);
      continue;
    }

    const html = await response.text();
    const results = extractResults(html);
    console.log("[JUVAO DDG Worker] endpoint", endpoint, "bytes", html.length, "results", results.length);
    if (results.length) return results;
  }
  return [];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-JUVAO-SECRET",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/search") {
      return jsonResponse({ service: "JUVAO DuckDuckGo Search", status: "ok" });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!env.JUVAO_SEARCH_SECRET) {
      return jsonResponse({ error: "Worker secret is not configured" }, 500);
    }

    if (request.headers.get("X-JUVAO-SECRET") !== env.JUVAO_SEARCH_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const query = (url.searchParams.get("q") || "").trim();
    if (!query || query.length > 400) {
      return jsonResponse({ error: "Invalid search query" }, 400);
    }

    try {
      const results = await searchDuckDuckGo(query);
      if (!results.length) {
        return jsonResponse({
          query,
          provider: "DuckDuckGo",
          results: [],
          error: "DuckDuckGo did not return usable results.",
        }, 502);
      }

      return jsonResponse({ query, provider: "DuckDuckGo", results });
    } catch (error) {
      console.error("[JUVAO DDG Worker] failed", error);
      return jsonResponse({ error: "DuckDuckGo request failed" }, 502);
    }
  },
};
