const path = require("path");
const express = require("express");
const cors = require("cors");
const { CORS_ORIGIN, FRONTEND_DIR } = require("./config");
const { getBootstrapPayload, getOwnerPackages, getRegionPackages, getProvincePackages } = require("./dashboard-repository");

function resolveCorsOrigin() {
  if (CORS_ORIGIN === "*") {
    return "*";
  }

  return CORS_ORIGIN.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createApp(db) {
  const app = express();

  if (CORS_ORIGIN) {
    app.use(
      cors({
        origin: resolveCorsOrigin(),
      })
    );
  }

  app.use(express.json());

  const api = express.Router();
  const frontendIndexPath = path.join(FRONTEND_DIR, "index.html");

  const asyncHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Temporary migration endpoint — remove after data migration is done
  api.post("/migrate", asyncHandler(async (req, res) => {
    const token = req.headers["x-migrate-token"];
    if (!token || token !== (process.env.MIGRATE_TOKEN || "migrate-jilid-2026")) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.json({ status: "migration started — watch Render logs for progress" });
    const { migrate } = require("../scripts/stream-migrate");
    migrate((counts) => console.log("[migrate] progress:", JSON.stringify(counts)))
      .then((result) => console.log("[migrate] done:", JSON.stringify(result)))
      .catch((err) => console.error("[migrate] failed:", err.message));
  }));

  api.get(
    "/bootstrap",
    asyncHandler(async (_req, res) => {
      res.json(await getBootstrapPayload(db));
    })
  );

  api.get(
    "/regions/:regionKey/packages",
    asyncHandler(async (req, res) => {
      const payload = await getRegionPackages(db, req.params.regionKey, req.query);

      if (!payload) {
        res.status(404).json({ error: "Region not found" });
        return;
      }

      res.json(payload);
    })
  );

  api.get(
    "/provinces/:provinceKey/packages",
    asyncHandler(async (req, res) => {
      const payload = await getProvincePackages(db, req.params.provinceKey, req.query);

      if (!payload) {
        res.status(404).json({ error: "Province not found" });
        return;
      }

      res.json(payload);
    })
  );

  api.get("/owners/packages", asyncHandler(async (req, res) => {
    const ownerType = (req.query.ownerType || "").trim();
    const ownerName = (req.query.ownerName || "").trim();

    if (!ownerType || !ownerName) {
      res.status(400).json({ error: "ownerType and ownerName are required" });
      return;
    }

    const payload = await getOwnerPackages(db, req.query);

    if (!payload) {
      res.status(404).json({ error: "Owner not found" });
      return;
    }

    res.json(payload);
  }));

  app.use("/api", api);
  app.use(express.static(FRONTEND_DIR));

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(frontendIndexPath);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = {
  createApp,
};
