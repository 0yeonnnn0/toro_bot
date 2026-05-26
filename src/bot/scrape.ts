const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;
const MAX_LENGTH = 2000;
const TIMEOUT_MS = 5000;

/** Extract URLs from text */
export function extractUrls(text: string): string[] {
  return [...(text.match(URL_REGEX) || [])];
}

/** Strip HTML tags and collapse whitespace */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch a URL and return plain text content (truncated) */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)" },
    });
    clearTimeout(timer);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null; // Skip binary, images, etc.
    }

    const html = await res.text();
    const text = htmlToText(html);
    return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + "..." : text;
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
  const urls = extractUrls(text);
  if (urls.length === 0) return "";

  const results = await Promise.all(
    urls.slice(0, 3).map(async (url) => {
      const content = await fetchPage(url);
      return content ? `<web_content url="${url}">\n${content}\n</web_content>` : null;
    })
  );

  const valid = results.filter(Boolean);
  if (valid.length === 0) return "";

  return "\n" + valid.join("\n");
}
