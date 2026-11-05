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

function extractVqd(html: string): string | null {
  return html.match(/vqd=['"]([^'"]+)['"]/)?.[1]
    ?? html.match(/vqd=([^&"']+)/)?.[1]
    ?? null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
}

export function buildDuckDuckGoImageProxyUrl(sourceUrl: string): string {
  const source = new URL(sourceUrl);
  if (source.protocol !== "http:" && source.protocol !== "https:") {
    throw new Error("unsupported image URL protocol");
  }
  const proxy = new URL("https://external-content.duckduckgo.com/iu/");
  proxy.searchParams.set("u", source.toString());
  proxy.searchParams.set("f", "1");
  proxy.searchParams.set("nofb", "1");
  return proxy.toString();
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
    .filter((item) => {
      try {
        return ["http:", "https:"].includes(new URL(item.imageUrl).protocol);
      } catch {
        return false;
      }
    });
}

async function downloadImage(candidate: Candidate): Promise<ImageSearchResult | null> {
  try {
    const proxyUrl = buildDuckDuckGoImageProxyUrl(candidate.imageUrl);
    const res = await fetchWithTimeout(proxyUrl, {
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

  const candidates = await searchDuckDuckGoImages(cleanQuery).catch(() => []);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.imageUrl)) continue;
    seen.add(candidate.imageUrl);
    const result = await downloadImage(candidate);
    if (result) return result;
  }

  return null;
}
