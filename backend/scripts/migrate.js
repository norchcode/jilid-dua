const fs = require("fs");
const path = require("path");
const { query, closePool } = require("../src/db");

async function main() {
  const schemaPath = path.resolve(__dirname, "..", "sql", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  await query(schemaSql);
  console.log("PostgreSQL schema is ready.");
}

main()
  .catch((error) => {
    console.error(`Database initialization failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
