// One-time migration: streams SQLite SQL dump → Postgres with batch inserts
const https = require("https");
const readline = require("readline");
const { Pool } = require("pg");

const DUMP_URL =
  "https://contenflowstorage.blob.core.windows.net/shared/datasets/dashboard.sql" +
  "?sp=r&st=2026-04-16T12:16:15Z&se=2029-04-16T20:31:15Z&spr=https" +
  "&sv=2025-11-05&sr=b&sig=sKPH9uazyLcYcSwhARcEwVSG%2FTld9VnGJgZ2mOZIxrA%3D";

const BATCH_SIZE = 50;

function parseHex(hex) {
  return Buffer.from(hex, "hex").toString("utf8");
}

function parseValues(line) {
  const match = line.match(/^INSERT INTO "([^"]+)" VALUES\(([\s\S]*)\);$/);
  if (!match) return null;
  const table = match[1];
  const valStr = match[2];
  const values = [];
  let i = 0;
  while (i < valStr.length) {
    while (i < valStr.length && (valStr[i] === " " || valStr[i] === ",")) i++;
    if (i >= valStr.length) break;
    if (valStr.substring(i, i + 7) === "CAST(X'") {
      const hexStart = i + 7;
      const hexEnd = valStr.indexOf("'", hexStart);
      values.push(parseHex(valStr.substring(hexStart, hexEnd)));
      i = valStr.indexOf(")", hexEnd + 1) + 1;
    } else if (valStr.substring(i, i + 4) === "NULL") {
      values.push(null); i += 4;
    } else if (valStr[i] === "'") {
      let str = ""; i++;
      while (i < valStr.length) {
        if (valStr[i] === "'" && valStr[i + 1] === "'") { str += "'"; i += 2; }
        else if (valStr[i] === "'") { i++; break; }
        else { str += valStr[i++]; }
      }
      values.push(str);
    } else {
      let numStr = "";
      while (i < valStr.length && valStr[i] !== "," && valStr[i] !== ")") numStr += valStr[i++];
      const trimmed = numStr.trim();
      if (!trimmed) break;
      const num = Number(trimmed);
      values.push(isNaN(num) ? trimmed : num);
    }
  }
  return { table, values };
}

async function flushBatch(client, table, batch, errors) {
  if (!batch.length) return;
  const colCount = batch[0].length;
  const placeholders = batch
    .map((_, rowIdx) =>
      "(" + Array.from({ length: colCount }, (_, colIdx) => `$${rowIdx * colCount + colIdx + 1}`).join(",") + ")"
    )
    .join(",");
  const flat = batch.flat();
  try {
    await client.query(
      `INSERT INTO "${table}" VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      flat
    );
  } catch (err) {
    // Batch failed — fall back to row-by-row to skip bad rows
    for (const row of batch) {
      const ph = "(" + row.map((_, i) => `$${i + 1}`).join(",") + ")";
      try {
        await client.query(`INSERT INTO "${table}" VALUES ${ph} ON CONFLICT DO NOTHING`, row);
      } catch (e2) {
        if (errors.length < 20) errors.push(`${table}: ${e2.message.substring(0, 100)}`);
      }
    }
  }
}

async function migrate(onProgress, skipTables = []) {
  const skipSet = new Set(skipTables);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  const counts = {};
  const errors = [];
  let currentTable = null;
  let batch = [];

  const client = await pool.connect();
  try {
    const response = await new Promise((resolve, reject) =>
      https.get(DUMP_URL, resolve).on("error", reject)
    );

    const rl = readline.createInterface({ input: response, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.startsWith("INSERT INTO")) continue;
      const parsed = parseValues(line);
      if (!parsed) continue;

      const { table, values } = parsed;
      if (skipSet.has(table)) continue;
      counts[table] = (counts[table] || 0) + 1;

      // Flush batch when table changes or batch is full
      if (table !== currentTable || batch.length >= BATCH_SIZE) {
        await flushBatch(client, currentTable, batch, errors);
        batch = [];
        currentTable = table;
      }
      batch.push(values);

      if (counts[table] % 5000 === 0 && onProgress) onProgress({ ...counts });
    }

    // Flush final batch
    await flushBatch(client, currentTable, batch, errors);
  } finally {
    client.release();
    await pool.end();
  }

  return { counts, errors };
}

module.exports = { migrate };

if (require.main === module) {
  require("dotenv").config();
  migrate((c) => console.log("[migrate] progress:", JSON.stringify(c)))
    .then((r) => { console.log("[migrate] done:", JSON.stringify(r)); process.exit(0); })
    .catch((e) => { console.error("[migrate] failed:", e.message); process.exit(1); });
}
