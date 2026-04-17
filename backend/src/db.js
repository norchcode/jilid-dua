const { Pool, types } = require("pg");
const { DATABASE_URL, DATABASE_SSL } = require("./config");

types.setTypeParser(types.builtins.INT8, (value) => Number(value));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

function assertDatabaseUrl() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Set it to your PostgreSQL connection string.");
  }
}

function createPool() {
  assertDatabaseUrl();

  return new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
}

const pool = createPool();

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function query(sql, params = []) {
  return pool.query(toPostgresSql(sql), params);
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function closePool() {
  await pool.end();
}

module.exports = {
  all,
  closePool,
  get,
  pool,
  query,
};
