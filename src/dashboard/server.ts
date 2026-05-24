import path from "path";
import crypto from "crypto";
import express from "express";
import apiRoutes from "./routes/api";
import { state } from "../shared/state";

const FRONTEND_DIR = path.join(__dirname, "../../frontend/dist");

function getSecret(): string {
  return state.config.dashboardSecret || process.env.DASHBOARD_SECRET || "";
}

// ── Rate Limiter for login ──
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export function createServer(): express.Application {
  const app = express();
  app.use(express.json());

  const sessions = new Set<string>();

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/login", (req, res) => {
    const secret = getSecret();
    if (!secret || secret === "changeme") return res.json({ ok: true });

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "too many attempts, try again later" });
    }

    if (req.body.password === secret) {
      const sessionId = crypto.randomUUID();
      sessions.add(sessionId);
      res.cookie("sid", sessionId, { httpOnly: true, sameSite: "strict", maxAge: 86400000 });
      return res.json({ ok: true });
    }
    res.status(401).json({ error: "wrong password" });
  });

  app.use("/api", (req, res, next) => {
    const secret = getSecret();
    if (!secret || secret === "changeme") return next();
    // Public chat endpoints - no auth required
    if (req.path.startsWith("/chat/characters") || req.path.startsWith("/chat/send") || req.path.startsWith("/music-logs") || req.path.startsWith("/calendar/oauth/callback")) {
      return next();
    }
    const cookieHeader = req.headers.cookie || "";
    const sidMatch = cookieHeader.match(/sid=([^;]+)/);
    if (sidMatch && sessions.has(sidMatch[1])) return next();
    if (req.headers.authorization === secret) return next();
    res.status(401).json({ error: "unauthorized" });
  });

  app.use("/api", apiRoutes);
  app.use(express.static(FRONTEND_DIR));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  });

  return app;
}
