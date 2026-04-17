const { HOST, PORT } = require("./config");
const db = require("./db");
const { createApp } = require("./app");

async function assertSchema() {
  const row = await db.get("SELECT to_regclass('public.regions') AS regions_table");

  if (!row?.regions_table) {
    throw new Error('PostgreSQL schema is missing. Run "npm run db:init" before starting the server.');
  }
}

async function main() {
  await assertSchema();

  const app = createApp(db);
  const server = app.listen(PORT, HOST, () => {
    console.log(`Dashboard backend listening on http://${HOST}:${PORT}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await db.closePool();
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 5000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
