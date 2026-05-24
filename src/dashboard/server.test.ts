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

  it("keeps Google OAuth callback public while protecting admin APIs", async () => {
    const app = createServer();
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("No test server address");
      const base = `http://127.0.0.1:${addr.port}`;

      const callback = await fetch(`${base}/api/calendar/oauth/callback?state=missing-code`);
      const overview = await fetch(`${base}/api/teams/overview`);

      expect(callback.status).toBe(400);
      expect(overview.status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });
});
