// One-time migration: streams SQLite SQL dump → Postgres
// Run via: node scripts/stream-migrate.js
// Or triggered via POST /api/migrate (temporary endpoint in app.js)

const https = require("https");
const readline = require("readline");
const { Pool } = require("pg");

const DUMP_URL =
  "https://contenflowstorage.blob.core.windows.net/shared/datasets/dashboard.sql" +
  "?sp=r&st=2026-04-16T12:16:15Z&se=2029-04-16T20:31:15Z&spr=https" +
  "&sv=2025-11-05&sr=b&sig=sKPH9uazyLcYcSwhARcEwVSG%2FTld9VnGJgZ2mOZIxrA%3D";

// Tables with FK deps on package_regions/package_provinces — buffer these
const DEFERRED_TABLES = new Set(["package_regions", "package_provinces"]);

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
      values.push(null);
      i += 4;
    } else if (valStr[i] === "'") {
      let str = "";
      i++;
      while (i < valStr.length) {
        if (valStr[i] === "'" && valStr[i + 1] === "'") { str += "'"; i += 2; }
        else if (valStr[i] === "'") { i++; break; }
        else { str += valStr[i]; i++; }
      }
      values.push(str);
    } else {
      let numStr = "";
      while (i < valStr.length && valStr[i] !== "," && valStr[i] !== ")") {
        numStr += valStr[i]; i++;
      }
      const trimmed = numStr.trim();
      if (!trimmed) break;
      const num = Number(trimmed);
      values.push(isNaN(num) ? trimmed : num);
    }
  }

  return { table, values };
}

async function insertBatch(client, table, rows) {
  for (const values of rows) {
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(",");
    await client.query(
      `INSERT INTO "${table}" VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values
    );
  }
}

async function migrate(onProgress) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  const counts = {};
  const errors = [];
  const deferred = {}; // buffer for FK-dependent tables

  const client = await pool.connect();
  try {
    await new Promise((resolve, reject) => {
      https.get(DUMP_URL, (res) => {
        const rl = readline.createInterface({ input: res, crlfDelay: Infinity });

        const queue = [];
        let processing = false;

        async function processQueue() {
          if (processing) return;
          processing = true;
          while (queue.length) {
            const line = queue.shift();
            if (!line.startsWith("INSERT INTO")) continue;

            const parsed = parseValues(line);
            if (!parsed) continue;

            const { table, values } = parsed;
            counts[table] = (counts[table] || 0) + 1;

            if (DEFERRED_TABLES.has(table)) {
              if (!deferred[table]) deferred[table] = [];
              deferred[table].push(values);
              continue;
            }

            try {
              const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
              await client.query(
                `INSERT INTO "${table}" VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                values
              );
            } catch (err) {
              errors.push(`${table}: ${err.message.substring(0, 120)}`);
            }

            if (counts[table] % 5000 === 0 && onProgress) onProgress({ ...counts });
          }
          processing = false;
        }

        rl.on("line", (line) => {
          queue.push(line);
          processQueue().catch(reject);
        });

        rl.on("close", () => {
          const wait = setInterval(() => {
            if (!processing && queue.length === 0) {
              clearInterval(wait);
              resolve();
            }
          }, 100);
        });

        res.on("error", reject);
      }).on("error", reject);
    });

    // Insert deferred tables (package_regions, package_provinces)
    for (const [table, rows] of Object.entries(deferred)) {
      console.log(`Inserting deferred ${table}: ${rows.length} rows`);
      for (const values of rows) {
        try {
          const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
          await client.query(
            `INSERT INTO "${table}" VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
        } catch (err) {
          errors.push(`${table}: ${err.message.substring(0, 120)}`);
        }
      }
      if (onProgress) onProgress({ ...counts });
    }
  } finally {
    client.release();
    await pool.end();
  }

  return { counts, errors: errors.slice(0, 20) };
}

module.exports = { migrate };

if (require.main === module) {
  require("dotenv").config();
  migrate((counts) => console.log("Progress:", JSON.stringify(counts)))
    .then((result) => { console.log("Done:", JSON.stringify(result)); process.exit(0); })
    .catch((err) => { console.error("Failed:", err); process.exit(1); });
}
