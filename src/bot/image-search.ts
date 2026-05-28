import { AttachmentBuilder } from "discord.js";

const TIMEOUT_MS = 7000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type ImageSearchResult = {
  attachment: AttachmentBuilder;
  sourceUrl: string;
  pageUrl?: string;
  title?: string;
};

type Candidate = {
  imageUrl: string;
  pageUrl?: string;
  title?: string;
};

export function isImageSearchRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return /(사진|이미지|짤|움짤).*(찾아|검색|가져와|보여|골라|추천)|(찾아|검색|가져와).*(사진|이미지|짤|움짤)/i.test(normalized);
}

export function extractImageSearchQuery(text: string): string {
  const cleaned = text
    .replace(/<@!?\d+>/g, " ")
    .trim()
    .replace(/^(토로야|토로|toro)[,\s:]*/i, "")
    .replace(/(사진|이미지|짤|움짤)\s*(좀|하나|한 장|몇 장)?\s*(찾아줘|찾아|검색해줘|검색|가져와|보여줘|보여|골라줘|추천해줘|추천)/gi, " ")
    .replace(/(찾아줘|찾아|검색해줘|검색|가져와|보여줘|보여|골라줘|추천해줘|추천)/gi, " ")
    .replace(/(사진|이미지|짤|움짤)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || text.replace(/<@!?\d+>/g, " ").trim();
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

function extractVqd(html: string): string | null {
  return html.match(/vqd=['"]([^'"]+)['"]/)?.[1]
    ?? html.match(/vqd=([^&"']+)/)?.[1]
    ?? null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGoImages(query: string): Promise<Candidate[]> {
  const pageUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const page = await fetchWithTimeout(pageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ToroBot/1.0)" },
  });
  if (!page.ok) return [];

  const html = await page.text();
  const vqd = extractVqd(html);
  if (!vqd) return [];

  const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`;
  const res = await fetchWithTimeout(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ToroBot/1.0)",
      "Referer": pageUrl,
      "Accept": "application/json, text/javascript, */*; q=0.01",
    },
  });
  if (!res.ok) return [];

  const data = await res.json() as { results?: Array<{ image?: string; url?: string; title?: string }> };
  return (data.results ?? [])
    .map((item) => ({ imageUrl: item.image || "", pageUrl: item.url, title: item.title }))
    .filter((item) => item.imageUrl.startsWith("http"));
}

async function searchPageOgImages(query: string): Promise<Candidate[]> {
  const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ToroBot/1.0)" },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const blocks = html.split(/<div class="result results_links/gi).slice(1, 6);
  const pageUrls = blocks.flatMap((block) => {
    const match = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) return [];
    try {
      const url = new URL(decodeHtmlEntities(match[1]), "https://duckduckgo.com");
      const uddg = url.searchParams.get("uddg");
      return [{ pageUrl: uddg ? decodeURIComponent(uddg) : url.toString(), title: decodeHtmlEntities(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) }];
    } catch {
      return [];
    }
  });

  const candidates: Candidate[] = [];
  for (const page of pageUrls) {
    try {
      const pageRes = await fetchWithTimeout(page.pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ToroBot/1.0)" },
      });
      const contentType = pageRes.headers.get("content-type") || "";
      if (!pageRes.ok || !contentType.includes("text/html")) continue;
      const pageHtml = await pageRes.text();
      const imageUrl = pageHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
        ?? pageHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
      if (!imageUrl) continue;
      candidates.push({ imageUrl: new URL(decodeHtmlEntities(imageUrl), page.pageUrl).toString(), pageUrl: page.pageUrl, title: page.title });
    } catch {}
  }
  return candidates;
}

async function downloadImage(candidate: Candidate): Promise<ImageSearchResult | null> {
  try {
    const res = await fetchWithTimeout(candidate.imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ToroBot/1.0)" },
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const ext = IMAGE_MIME_EXT[contentType];
    if (!ext) return null;

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;

    return {
      attachment: new AttachmentBuilder(buffer, { name: `toro-search.${ext}` }),
      sourceUrl: candidate.imageUrl,
      pageUrl: candidate.pageUrl,
      title: candidate.title,
    };
  } catch {
    return null;
  }
}

export async function searchImageAttachment(query: string): Promise<ImageSearchResult | null> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  const candidates = [
    ...(await searchDuckDuckGoImages(cleanQuery).catch(() => [])),
    ...(await searchPageOgImages(`${cleanQuery} 사진`).catch(() => [])),
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.imageUrl)) continue;
    seen.add(candidate.imageUrl);
    const result = await downloadImage(candidate);
    if (result) return result;
  }

  return null;
}
