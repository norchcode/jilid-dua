const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT_DIR = path.resolve(ROOT_DIR, "..");

function resolveFromRoot(value, fallback) {
  const target = value || fallback;
  return path.isAbsolute(target) ? target : path.join(ROOT_DIR, target);
}

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer.");
}

const host = process.env.HOST || "0.0.0.0";

module.exports = {
  ROOT_DIR,
  REPO_ROOT_DIR,
  HOST: host,
  PORT: port,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "",
  DATABASE_URL: process.env.DATABASE_URL || "",
  DATABASE_SSL: ["1", "true", "yes"].includes(String(process.env.DATABASE_SSL || "").toLowerCase()),
  FRONTEND_DIR: process.env.FRONTEND_DIR
    ? resolveFromRoot(process.env.FRONTEND_DIR)
    : path.join(REPO_ROOT_DIR, "frontend"),
  DEFAULT_REGION_PAGE_SIZE: 25,
  MAX_REGION_PAGE_SIZE: 100,
};
