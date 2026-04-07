import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { getStats as getRagStats, listVectors, searchRelevant, storeConversation, initIndex } from "../../bot/rag";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

router.get("/rag-stats", async (_req: Request, res: Response) => res.json(await getRagStats()));

router.get("/rag/vectors", async (_req: Request, res: Response) => res.json(await listVectors()));

router.get("/rag/timeline", async (_req: Request, res: Response) => {
  const vectors = await listVectors();
  const byDate: Record<string, { date: string; stored: number; hits: number }> = {};
  for (const v of vectors) {
    const date = new Date(v.timestamp).toISOString().split("T")[0];
    if (!byDate[date]) byDate[date] = { date, stored: 0, hits: 0 };
    byDate[date].stored++;
    byDate[date].hits += v.hits;
  }
  res.json(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
});

router.post("/rag/search", async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query가 필요합니다" });
  try {
    const results = await searchRelevant(query, 5);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/rag/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "파일이 필요합니다" });
  try {
    const text = req.file.buffer.toString("utf-8");
    const filename = req.file.originalname || "unknown";
    const isMd = filename.endsWith(".md");

    if (isMd) {
      // ── Obsidian / Markdown 파일 ──
      // Strip YAML frontmatter
      const content = text.replace(/^---[\s\S]*?---\n*/m, "").trim();
      if (!content) return res.status(400).json({ error: "노트 내용이 비어있습니다" });

      // Split by headings or paragraphs into chunks (~500 chars)
      const chunks: string[] = [];
      const sections = content.split(/\n(?=#{1,3}\s)/);
      for (const section of sections) {
        if (section.trim().length === 0) continue;
        if (section.length <= 500) {
          chunks.push(section.trim());
        } else {
          // Split long sections by double newline
          const paragraphs = section.split(/\n\n+/);
          let buf = "";
          for (const p of paragraphs) {
            if (buf.length + p.length > 500 && buf) {
              chunks.push(buf.trim());
              buf = "";
            }
            buf += (buf ? "\n\n" : "") + p;
          }
          if (buf.trim()) chunks.push(buf.trim());
        }
      }

      const noteName = filename.replace(/\.md$/, "");
      let stored = 0;
      for (const chunk of chunks) {
        await storeConversation({
          channel: `note:${noteName}`,
          messages: [{ content: chunk }],
          timestamp: Date.now(),
        });
        stored++;
      }

      const stats = await getRagStats();
      res.json({ parsed: chunks.length, chunks: stored, totalVectors: stats.vectorCount, type: "markdown" });
    } else {
      // ── KakaoTalk 채팅 파일 ──
      const lines = text.split("\n");
      const msgRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4}\s+[오전후]+\s+\d{1,2}:\d{2}),\s*(.+?)\s*:\s*(.+)$/;
      const messages: { content: string }[] = [];

      for (const line of lines) {
        const match = line.match(msgRegex);
        if (match) messages.push({ content: `${match[2]}: ${match[3]}` });
      }

      if (messages.length === 0) {
        return res.status(400).json({ error: "파싱된 메시지가 없습니다 (.md 또는 카카오톡 .txt 파일만 지원)" });
      }

      const chunkSize = 5;
      let stored = 0;
      for (let i = 0; i < messages.length; i += chunkSize) {
        await storeConversation({ channel: "kakaotalk-import", messages: messages.slice(i, i + chunkSize), timestamp: Date.now() });
        stored++;
      }

      const stats = await getRagStats();
      res.json({ parsed: messages.length, chunks: stored, totalVectors: stats.vectorCount, type: "kakaotalk" });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/rag", async (_req: Request, res: Response) => {
  const vectorDir = path.join(__dirname, "../../../data/vectors");
  try {
    if (fs.existsSync(vectorDir)) {
      fs.rmSync(vectorDir, { recursive: true });
      fs.mkdirSync(vectorDir, { recursive: true });
    }
    await initIndex();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
