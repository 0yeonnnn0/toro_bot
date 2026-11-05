import { promises as dns } from "dns";
import net from "net";

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;
const TIMEOUT_MS = 5000;

/** Extract URLs from text */
export function extractUrls(text: string): string[] {
  return [...(text.match(URL_REGEX) || [])];
}

export function isPrivateAddress(rawAddress: string): boolean {
  const address = rawAddress.toLowerCase().split("%")[0].replace(/^\[|\]$/g, "");
  if (address.startsWith("::ffff:")) return isPrivateAddress(address.slice(7));

  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }

  if (net.isIPv6(address)) {
    return address === "::"
      || address === "::1"
      || address.startsWith("fc")
      || address.startsWith("fd")
      || /^fe[89ab]/.test(address)
      || address.startsWith("ff")
      || address.startsWith("2001:db8:");
  }

  return true;
}

type LookupAddress = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

const defaultLookup: LookupAll = async (hostname) => dns.lookup(hostname, { all: true });

export async function validatePublicUrl(rawUrl: string, lookup: LookupAll = defaultLookup): Promise<string | null> {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return null;

    if (net.isIP(hostname)) return isPrivateAddress(hostname) ? null : url.toString();
    const addresses = await lookup(hostname);
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  const decoded = decodeHtmlEntities(rawUrl);
  try {
    const url = new URL(decoded, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return decoded;
  }
}

export function shouldFetchWebSearchContext(text: string): boolean {
  if (extractUrls(text).length > 0) return false;
  return /(검색|찾아|웹|최신|요즘|뉴스|가격|일정|추천|비교|어때|어떻게 생각|뭐가 좋아|어느 쪽)/i.test(text);
}

export function buildWebSearchQuery(text: string): string {
  return text
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function searchDuckDuckGo(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  if (!query) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ToroBot/1.0)" },
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const blocks = html.split(/<div class="result results_links/gi).slice(1, 6);
    for (const block of blocks) {
      const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
        ?? block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      results.push({
        title: stripTags(linkMatch[2]),
        url: normalizeDuckDuckGoUrl(linkMatch[1]),
        snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function fetchWebSearchContext(text: string): Promise<string> {
  if (!shouldFetchWebSearchContext(text)) return "";
  const query = buildWebSearchQuery(text);
  const results = await searchDuckDuckGo(query);
  if (results.length === 0) return "";
  const body = results.slice(0, 3).map((result, index) => (
    `${index + 1}. ${result.title}\n${result.url}${result.snippet ? `\n${result.snippet}` : ""}`
  )).join("\n\n");
  return `\n<web_search query="${query.replace(/"/g, "&quot;")}">\n${body}\n</web_search>`;
}

/** Fetch all URLs in text and return combined context string */
export async function fetchUrlContext(text: string): Promise<string> {
  void text;
  return "";
}
