import "dotenv/config";
import { start as startBot } from "./bot/client";
import { createServer } from "./dashboard/server";
import { initIndex } from "./bot/rag";
import { initVault } from "./bot/vault";

async function main(): Promise<void> {
  await initIndex();
  initVault();
  await startBot();

  const port = parseInt(process.env.DASHBOARD_PORT || "3000");
  const app = createServer();
  app.listen(port, () => {
    console.log(`대시보드 실행 중: http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("시작 실패:", err);
  process.exit(1);
});
