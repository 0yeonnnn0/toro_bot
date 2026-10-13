import { describe, it, expect, beforeEach } from "vitest";
import type { Server } from "http";
import { state } from "../shared/state";

// Test that the server module exports createServer
import { createServer } from "./server";

describe("createServer", () => {
  beforeEach(() => {
    state.config.dashboardSecret = "test-secret-123";
  });

  it("returns an express app", () => {
    const app = createServer();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });

  it("has /api routes registered", () => {
    const app = createServer();
    // Express stores routes in _router.stack
    const routes = (app as any)._router?.stack || [];
    expect(routes.length).toBeGreaterThan(0);
  });

  it("does not expose web chat, team login, calendar, or memory APIs", async () => {
    const app = createServer();
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("No test server address");
      const base = `http://127.0.0.1:${addr.port}`;
      const headers = { authorization: "test-secret-123" };

      const paths = [
        "/api/chat/characters",
        "/api/auth/session",
        "/api/account/guilds",
        "/api/teams/overview",
        "/api/calendar/oauth/callback",
        "/api/rag-stats",
        "/api/stored/conversations",
        "/api/presets",
        "/api/chat-logs",
        "/api/chat-logs/stats",
        "/api/user-stats",
        "/api/keywords",
      ];
      const responses = await Promise.all(paths.map(path => fetch(base + path, { headers })));

      expect(responses.map(response => response.status)).toEqual(paths.map(() => 404));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });

  it("exposes unauthenticated healthcheck endpoint", async () => {
    const app = createServer();
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("No test server address");
      const base = `http://127.0.0.1:${addr.port}`;

      const health = await fetch(`${base}/healthz`);

      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });

  it("fails closed for admin APIs when no dashboard secret is configured", async () => {
    state.config.dashboardSecret = "";
    const app = createServer();
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("No test server address");
      const base = `http://127.0.0.1:${addr.port}`;

      const [queues, musicLogs] = await Promise.all([
        fetch(`${base}/api/music/queues`),
        fetch(`${base}/api/music-logs`),
      ]);

      expect(queues.status).toBe(503);
      expect(musicLogs.status).toBe(200);
      const logs = await musicLogs.json() as Record<string, unknown>[];
      expect(logs.every(log => !("requestedBy" in log))).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });
});
