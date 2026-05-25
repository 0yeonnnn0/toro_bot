import fs from "fs";
import path from "path";
import { LocalIndex } from "vectra";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { state } from "../shared/state";

const DATA_DIR = path.join(__dirname, "../../data/vectors");
const HITS_FILE = path.join(__dirname, "../../data/rag-hits.json");
const index = new LocalIndex(DATA_DIR);

// ── Types ──
export interface SearchResult {
  id: string;
  text: string;
  channel: string;
  teamId: string | null;
  timestamp: number;
  score: number;
}

export interface VectorItem {
  id: string;
  channel: string;
  teamId: string | null;
  timestamp: number;
  text: string;
  messageCount: number;
  hits: number;
  lastHit: number | null;
}

interface HitRecord {
  count: number;
  lastHit: number;
  timestamp: number;
}

// ── Hit counts ──
let hitCounts: Record<string, HitRecord> = {};
try {
  if (fs.existsSync(HITS_FILE)) {
    hitCounts = JSON.parse(fs.readFileSync(HITS_FILE, "utf-8"));
  }
} catch {}

function saveHits(): void {
  try {
    const dir = path.dirname(HITS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HITS_FILE, JSON.stringify(hitCounts));
  } catch {}
}

setInterval(saveHits, 30000);

// ── Embeddings ──
let genAI: GoogleGenerativeAI | null = null;
let openai: OpenAI | null = null;

type EmbeddingProvider = "google" | "openai";

function embeddingProvider(): EmbeddingProvider {
  return (state.config.embeddingProvider || process.env.EMBEDDING_PROVIDER || "google") as EmbeddingProvider;
}

function googleKey(): string {
  return state.config.googleApiKey || process.env.GOOGLE_API_KEY || "";
}

function openAIKey(): string {
  return state.config.openaiApiKey || process.env.OPENAI_API_KEY || "";
}

export function isRagEnabled(): boolean {
  const provider = embeddingProvider();
  if (provider === "openai") return Boolean(openAIKey());
  return Boolean(googleKey());
}

export function getRagProviderInfo(): { provider: EmbeddingProvider; model: string; enabled: boolean } {
  const provider = embeddingProvider();
  const model = state.config.embeddingModel || process.env.EMBEDDING_MODEL || (provider === "openai" ? "text-embedding-3-small" : "gemini-embedding-001");
  return { provider, model, enabled: isRagEnabled() };
}

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) genAI = new GoogleGenerativeAI(googleKey());
  return genAI;
}

function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: openAIKey() });
  return openai;
}

async function getEmbedding(text: string): Promise<number[]> {
  const { provider, model } = getRagProviderInfo();
  if (provider === "openai") {
    const result = await getOpenAI().embeddings.create({ model, input: text });
    return result.data[0].embedding;
  }
  const gemini = getGenAI().getGenerativeModel({ model });
  const result = await gemini.embedContent(text);
  return result.embedding.values;
}

// ── Public API ──
export async function initIndex(): Promise<void> {
  if (!(await index.isIndexCreated())) {
    await index.createIndex();
    console.log("벡터 인덱스 생성 완료");
  }
  console.log("RAG 시스템 초기화 완료");
}

export async function storeConversation(params: {
  channel: string;
  messages: { content: string }[];
  timestamp: number;
  teamId?: string | null;
}): Promise<void> {
  if (!isRagEnabled()) return;
  const text = params.messages.map((m) => m.content).join("\n");
  try {
    const vector = await getEmbedding(text);
    await index.insertItem({
      vector,
      metadata: {
        channel: params.channel,
        teamId: params.teamId ?? "",
        timestamp: params.timestamp,
        text,
        messageCount: params.messages.length,
      },
    });
  } catch (err) {
    console.error("벡터 저장 실패:", (err as Error).message);
  }
}

export async function searchRelevant(query: string, topK: number = 3, options: { teamId?: string | null } = {}): Promise<SearchResult[]> {
  if (!isRagEnabled()) return [];
  try {
    if (!(await index.isIndexCreated())) return [];
    const vector = await getEmbedding(query);
    const results = await (index as any).queryItems(vector, Math.max(topK * 8, topK)) as any[];

    const filtered = results
      .filter((r: any) => options.teamId === undefined || ((r.item.metadata.teamId as string) || null) === options.teamId)
      .filter((r: any) => r.score > 0.5)
      .slice(0, topK);

    for (const r of filtered) {
      const id = r.item.id || String(r.item.metadata.timestamp);
      if (!hitCounts[id]) hitCounts[id] = { count: 0, lastHit: 0, timestamp: r.item.metadata.timestamp };
      hitCounts[id].count++;
      hitCounts[id].lastHit = Date.now();
    }

    return filtered.map((r: any) => ({
      id: r.item.id,
      text: r.item.metadata.text,
      channel: r.item.metadata.channel,
      teamId: (r.item.metadata.teamId as string) || null,
      timestamp: r.item.metadata.timestamp,
      score: r.score,
    }));
  } catch (err) {
    console.error("벡터 검색 실패:", (err as Error).message);
    return [];
  }
}

export function formatContext(results: SearchResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map((r) => {
    const date = new Date(r.timestamp).toLocaleDateString("ko-KR");
    const matchPct = Math.round(r.score * 100);
    return `<past_conversation date="${date}" channel="${r.channel}" relevance="${matchPct}%">\n${r.text}\n</past_conversation>`;
  });
  return `\n아래는 과거에 이 서버에서 나눈 대화야. 직접 인용하지 말고, 맥락을 이해하는 데 자연스럽게 활용해.\n${lines.join("\n")}`;
}

export async function getStats(): Promise<{ vectorCount: number; indexCreated: boolean; enabled: boolean; provider: string; model: string; teams: Record<string, number> }> {
  const info = getRagProviderInfo();
  try {
    if (!(await index.isIndexCreated())) return { vectorCount: 0, indexCreated: false, enabled: info.enabled, provider: info.provider, model: info.model, teams: {} };
    const items = await index.listItems();
    const teams: Record<string, number> = {};
    for (const item of items as any[]) {
      const key = (item.metadata.teamId as string) || "global";
      teams[key] = (teams[key] || 0) + 1;
    }
    return { vectorCount: items.length, indexCreated: true, enabled: info.enabled, provider: info.provider, model: info.model, teams };
  } catch {
    return { vectorCount: 0, indexCreated: false, enabled: info.enabled, provider: info.provider, model: info.model, teams: {} };
  }
}

export async function listVectors(options: { teamId?: string | null; limit?: number } = {}): Promise<VectorItem[]> {
  try {
    if (!(await index.isIndexCreated())) return [];
    const items = await index.listItems();
    return (items as any[])
      .filter((item) => options.teamId === undefined || ((item.metadata.teamId as string) || null) === options.teamId)
      .map((item: any) => ({
        id: item.id,
        channel: item.metadata.channel,
        teamId: (item.metadata.teamId as string) || null,
        timestamp: item.metadata.timestamp,
        text: item.metadata.text,
        messageCount: item.metadata.messageCount,
        hits: hitCounts[item.id]?.count || 0,
        lastHit: hitCounts[item.id]?.lastHit || null,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, options.limit ?? 200);
  } catch {
    return [];
  }
}

export async function testRag(query = "토로 RAG 테스트"): Promise<{ ok: boolean; error?: string; vectorLength?: number; results?: SearchResult[] }> {
  if (!isRagEnabled()) return { ok: false, error: `${embeddingProvider()} embedding key is not configured` };
  try {
    const vector = await getEmbedding(query);
    const results = await searchRelevant(query, 3);
    return { ok: true, vectorLength: vector.length, results };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
