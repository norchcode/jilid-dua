const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createApp } = require("../src/app");

function createFakeDb() {
  return {
    async get(sql) {
      if (sql.includes("FROM packages")) {
        return {
          total_packages: 0,
          total_priority_packages: 0,
          total_potential_waste: 0,
          total_budget: 0,
          unmapped_packages: 0,
          multi_location_packages: 0,
        };
      }

      return null;
    },
    async all() {
      return [];
    },
  };
}

test("serves API and static frontend from the same Express app", async () => {
  const server = createApp(createFakeDb()).listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const bootstrap = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(bootstrap.status, 200);
    assert.equal((await bootstrap.json()).summary.totalPackages, 0);

    const frontend = await fetch(`${baseUrl}/some/frontend/route`);
    assert.equal(frontend.status, 200);
    assert.match(await frontend.text(), /<title>Audit Pengadaan Kab\/Kota - LKPP 2026<\/title>/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
