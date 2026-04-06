import fs from "fs";
import path from "path";
import { LocalIndex } from "vectra";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { state } from "../shared/state";

const DATA_DIR = path.join(__dirname, "../../data/vectors");
const HITS_FILE = path.join(__dirname, "../../data/rag-hits.json");
const index = new LocalIndex(DATA_DIR);

// ── Types ──
export interface SearchResult {
  id: string;
  text: string;
  channel: string;
  timestamp: number;
  score: number;
}

export interface VectorItem {
  id: string;
  channel: string;
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

// ── GenAI ──
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  }
  return genAI;
}

async function getEmbedding(text: string): Promise<number[]> {
  const embeddingModel = state.config.embeddingModel || "gemini-embedding-001";
  const model = getGenAI().getGenerativeModel({ model: embeddingModel });
  const result = await model.embedContent(text);
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
}): Promise<void> {
  const text = params.messages.map((m) => m.content).join("\n");
  try {
    const vector = await getEmbedding(text);
    await index.insertItem({
      vector,
      metadata: {
        channel: params.channel,
        timestamp: params.timestamp,
        text,
        messageCount: params.messages.length,
      },
    });
  } catch (err) {
    console.error("벡터 저장 실패:", (err as Error).message);
  }
}

export async function searchRelevant(query: string, topK: number = 3): Promise<SearchResult[]> {
  try {
    if (!(await index.isIndexCreated())) return [];
    const vector = await getEmbedding(query);
    const results = await (index as any).queryItems(vector, topK) as any[];

    const filtered = results.filter((r: any) => r.score > 0.5);

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

export async function getStats(): Promise<{ vectorCount: number; indexCreated: boolean }> {
  try {
    if (!(await index.isIndexCreated())) return { vectorCount: 0, indexCreated: false };
    const items = await index.listItems();
    return { vectorCount: items.length, indexCreated: true };
  } catch {
    return { vectorCount: 0, indexCreated: false };
  }
}

export async function listVectors(): Promise<VectorItem[]> {
  try {
    if (!(await index.isIndexCreated())) return [];
    const items = await index.listItems();
    return items.map((item: any) => ({
      id: item.id,
      channel: item.metadata.channel,
      timestamp: item.metadata.timestamp,
      text: item.metadata.text,
      messageCount: item.metadata.messageCount,
      hits: hitCounts[item.id]?.count || 0,
      lastHit: hitCounts[item.id]?.lastHit || null,
    }));
  } catch {
    return [];
  }
}
