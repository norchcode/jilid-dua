const { DEFAULT_REGION_PAGE_SIZE, MAX_REGION_PAGE_SIZE } = require("./config");

const LEGEND_COLORS = ["#7b86a3", "#b5a882", "#d4a999", "#8b7332", "#a83c2e"];
const VALID_OWNER_TYPES = ["kabkota", "provinsi", "central", "other"];
const VALID_SEVERITIES = ["low", "med", "high", "absurd"];
const OWNER_METRIC_DEFINITIONS = [
  ["central", "central_packages", "central_priority_packages", "central_potential_waste", "central_budget"],
  ["provinsi", "provincial_packages", "provincial_priority_packages", "provincial_potential_waste", "provincial_budget"],
  ["kabkota", "local_packages", "local_priority_packages", "local_potential_waste", "local_budget"],
  ["other", "other_packages", "other_priority_packages", "other_potential_waste", "other_budget"],
];

async function getJsonAsset(db, key, fallback) {
  const row = await db.get("SELECT json FROM assets WHERE key = ?", [key]);
  return row ? JSON.parse(row.json) : fallback;
}

function clampInteger(value, defaultValue, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : defaultValue;
}

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "ya"].includes(String(value).trim().toLowerCase());
}

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}

function dominantOwnerType(row) {
  const counts = [
    { key: "central", value: row.central_packages || 0 },
    { key: "provinsi", value: row.provincial_packages || 0 },
    { key: "kabkota", value: row.local_packages || 0 },
    { key: "other", value: row.other_packages || 0 },
  ].sort((left, right) => right.value - left.value);

  return counts[0].value > 0 ? counts[0].key : null;
}

function buildOwnerMetrics(row) {
  return OWNER_METRIC_DEFINITIONS.reduce((metrics, [key, countField, priorityField, wasteField, budgetField]) => {
    metrics[key] = {
      totalPackages: row[countField] || 0,
      totalPriorityPackages: row[priorityField] || 0,
      totalPotentialWaste: row[wasteField] || 0,
      totalBudget: row[budgetField] || 0,
    };
    return metrics;
  }, {});
}

function buildProvinceOwnerMetrics(row) {
  return {
    central: { totalPackages: 0, totalPriorityPackages: 0, totalPotentialWaste: 0, totalBudget: 0 },
    provinsi: {
      totalPackages: row.total_packages || 0,
      totalPriorityPackages: row.total_priority_packages || 0,
      totalPotentialWaste: row.total_potential_waste || 0,
      totalBudget: row.total_budget || 0,
    },
    kabkota: { totalPackages: 0, totalPriorityPackages: 0, totalPotentialWaste: 0, totalBudget: 0 },
    other: { totalPackages: 0, totalPriorityPackages: 0, totalPotentialWaste: 0, totalBudget: 0 },
  };
}

function mapOwnerRow(row) {
  return {
    ownerType: row.owner_type,
    ownerName: row.owner_name,
    totalPackages: row.total_packages,
    totalPriorityPackages: row.total_priority_packages,
    totalFlaggedPackages: row.total_flagged_packages,
    totalPotentialWaste: row.total_potential_waste,
    totalBudget: row.total_budget,
    severityCounts: {
      med: row.med_severity_packages,
      high: row.high_severity_packages,
      absurd: row.absurd_severity_packages,
    },
  };
}

function mapRegionRow(row) {
  return {
    regionKey: row.region_key,
    code: row.code,
    provinceName: row.province_name,
    regionName: row.region_name,
    regionType: row.region_type,
    displayName: row.display_name,
    totalPackages: row.total_packages,
    totalPriorityPackages: row.total_priority_packages,
    totalFlaggedPackages: row.total_flagged_packages,
    totalPotentialWaste: row.total_potential_waste,
    totalBudget: row.total_budget,
    avgRiskScore: Number((row.avg_risk_score || 0).toFixed(2)),
    maxRiskScore: row.max_risk_score,
    ownerMix: {
      central: row.central_packages,
      provinsi: row.provincial_packages,
      kabkota: row.local_packages,
      other: row.other_packages,
    },
    ownerMetrics: buildOwnerMetrics(row),
    severityCounts: {
      med: row.med_severity_packages,
      high: row.high_severity_packages,
      absurd: row.absurd_severity_packages,
    },
    dominantOwnerType: dominantOwnerType(row),
  };
}

function mapProvinceRow(row) {
  return {
    provinceKey: row.province_key,
    code: row.code,
    provinceName: row.province_name,
    regionName: row.province_name,
    regionType: "Provinsi",
    displayName: row.display_name,
    totalPackages: row.total_packages,
    totalPriorityPackages: row.total_priority_packages,
    totalFlaggedPackages: row.total_flagged_packages,
    totalPotentialWaste: row.total_potential_waste,
    totalBudget: row.total_budget,
    avgRiskScore: Number((row.avg_risk_score || 0).toFixed(2)),
    maxRiskScore: row.max_risk_score,
    ownerMix: { central: 0, provinsi: row.total_packages, kabkota: 0, other: 0 },
    ownerMetrics: buildProvinceOwnerMetrics(row),
    severityCounts: {
      med: row.med_severity_packages,
      high: row.high_severity_packages,
      absurd: row.absurd_severity_packages,
    },
    dominantOwnerType: row.total_packages > 0 ? "provinsi" : null,
  };
}

function buildLegend(values) {
  const positiveValues = values.filter((value) => value > 0).sort((left, right) => left - right);
  const ranges = [];

  if (!positiveValues.length) {
    return { zeroColor: "#243155", ranges };
  }

  const quantiles = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
    const index = Math.min(positiveValues.length - 1, Math.floor((positiveValues.length - 1) * ratio));
    return positiveValues[index];
  });

  let minimum = positiveValues[0];

  for (let index = 0; index < quantiles.length; index += 1) {
    const maximum = quantiles[index];
    if (maximum < minimum) continue;
    if (ranges.length && maximum === ranges[ranges.length - 1].max) continue;

    ranges.push({
      key: `band-${index + 1}`,
      color: LEGEND_COLORS[Math.min(index, LEGEND_COLORS.length - 1)],
      min: minimum,
      max: maximum,
    });

    minimum = maximum + 0.01;
  }

  return { zeroColor: "#243155", ranges };
}

async function getNationalSummary(db) {
  return db.get(`
    SELECT
      COUNT(*) AS total_packages,
      COALESCE(SUM(is_priority), 0) AS total_priority_packages,
      COALESCE(ROUND(CAST(SUM(potential_waste) AS numeric), 2), 0)::double precision AS total_potential_waste,
      COALESCE(SUM(COALESCE(budget, 0)), 0) AS total_budget,
      COALESCE(SUM(CASE WHEN mapped_region_count = 0 THEN 1 ELSE 0 END), 0) AS unmapped_packages,
      COALESCE(SUM(CASE WHEN mapped_region_count > 1 THEN 1 ELSE 0 END), 0) AS multi_location_packages
    FROM packages
  `);
}

async function getRegionRows(db) {
  return db.all(`
    SELECT regions.*, region_metrics.*
    FROM regions
    INNER JOIN region_metrics ON region_metrics.region_key = regions.region_key
    ORDER BY
      region_metrics.total_potential_waste DESC,
      region_metrics.total_priority_packages DESC,
      region_metrics.total_packages DESC,
      regions.display_name ASC
  `);
}

async function getProvinceRows(db) {
  return db.all(`
    SELECT provinces.*, province_metrics.*
    FROM provinces
    INNER JOIN province_metrics ON province_metrics.province_key = provinces.province_key
    ORDER BY
      province_metrics.total_potential_waste DESC,
      province_metrics.total_priority_packages DESC,
      province_metrics.total_packages DESC,
      provinces.display_name ASC
  `);
}

async function getOwnerRows(db, ownerType) {
  return db.all(
    `
      SELECT *
      FROM owner_metrics
      WHERE owner_type = ?
      ORDER BY
        total_potential_waste DESC,
        total_priority_packages DESC,
        total_packages DESC,
        owner_name ASC
    `,
    [ownerType]
  );
}

function normalizeScopedPackageQuery(requestQuery, options = {}) {
  return {
    page: clampInteger(requestQuery.page, 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: clampInteger(requestQuery.pageSize, DEFAULT_REGION_PAGE_SIZE, 1, MAX_REGION_PAGE_SIZE),
    search: (requestQuery.search || "").trim(),
    ownerType: options.allowOwnerType === false ? "" : (requestQuery.ownerType || "").trim(),
    severity: options.allowSeverity === false ? "" : (requestQuery.severity || "").trim(),
    priorityOnly: parseBooleanQuery(requestQuery.priorityOnly),
  };
}

function buildPackagesWhereClause(scopeColumn, scopeKey, query, options = {}) {
  const clauses = [`${scopeColumn} = ?`];
  const params = [scopeKey];

  if (query.search) {
    const searchValue = `%${escapeLikePattern(query.search)}%`;
    clauses.push(
      "(packages.package_name ILIKE ? ESCAPE '\\' OR packages.owner_name ILIKE ? ESCAPE '\\' OR COALESCE(packages.satker, '') ILIKE ? ESCAPE '\\')"
    );
    params.push(searchValue, searchValue, searchValue);
  }

  if (options.forcedOwnerType) {
    clauses.push("packages.owner_type = ?");
    params.push(options.forcedOwnerType);
  } else if (VALID_OWNER_TYPES.includes(query.ownerType)) {
    clauses.push("packages.owner_type = ?");
    params.push(query.ownerType);
  }

  if (options.allowSeverity !== false && VALID_SEVERITIES.includes(query.severity)) {
    clauses.push("packages.severity = ?");
    params.push(query.severity);
  }

  if (query.priorityOnly) {
    clauses.push("packages.is_priority = 1");
  }

  return { sql: clauses.join(" AND "), params };
}

function buildOwnerPackagesWhereClause(ownerType, ownerName, query) {
  const clauses = ["packages.owner_type = ?", "packages.owner_name = ?"];
  const params = [ownerType, ownerName];

  if (query.search) {
    const searchValue = `%${escapeLikePattern(query.search)}%`;
    clauses.push(
      "(packages.package_name ILIKE ? ESCAPE '\\' OR packages.owner_name ILIKE ? ESCAPE '\\' OR COALESCE(packages.satker, '') ILIKE ? ESCAPE '\\')"
    );
    params.push(searchValue, searchValue, searchValue);
  }

  if (VALID_SEVERITIES.includes(query.severity)) {
    clauses.push("packages.severity = ?");
    params.push(query.severity);
  }

  if (query.priorityOnly) {
    clauses.push("packages.is_priority = 1");
  }

  return { sql: clauses.join(" AND "), params };
}

function mapPackageRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    packageName: row.package_name,
    ownerName: row.owner_name,
    ownerType: row.owner_type,
    satker: row.satker,
    locationRaw: row.location_raw,
    budget: row.budget,
    fundingSource: row.funding_source,
    procurementType: row.procurement_type,
    procurementMethod: row.procurement_method,
    selectionDate: row.selection_date,
    audit: {
      schemaVersion: row.schema_version,
      severity: row.severity,
      potensiPemborosan: row.potential_waste,
      reason: row.reason,
      flags: {
        isMencurigakan: row.is_mencurigakan === null ? null : Boolean(row.is_mencurigakan),
        isPemborosan: row.is_pemborosan === null ? null : Boolean(row.is_pemborosan),
      },
    },
    meta: {
      isPriority: Boolean(row.is_priority),
      isFlagged: Boolean(row.is_flagged),
      riskScore: row.risk_score,
      activeTagCount: row.active_tag_count,
      mappedRegionCount: row.mapped_region_count,
    },
  };
}

async function queryPackagesPage(db, scopeTable, scopeColumn, scopeKey, normalizedQuery, options = {}) {
  const whereClause = buildPackagesWhereClause(scopeColumn, scopeKey, normalizedQuery, options);
  const countRow = await db.get(
    `
      SELECT COUNT(*) AS total
      FROM ${scopeTable}
      INNER JOIN packages ON packages.id = ${scopeTable}.package_id
      WHERE ${whereClause.sql}
    `,
    whereClause.params
  );
  const totalItems = countRow.total || 0;
  const totalPages = totalItems ? Math.ceil(totalItems / normalizedQuery.pageSize) : 1;
  const page = Math.min(normalizedQuery.page, totalPages);
  const offset = (page - 1) * normalizedQuery.pageSize;
  const rows = await db.all(
    `
      SELECT packages.*
      FROM ${scopeTable}
      INNER JOIN packages ON packages.id = ${scopeTable}.package_id
      WHERE ${whereClause.sql}
      ORDER BY
        packages.is_priority DESC,
        packages.potential_waste DESC,
        packages.risk_score DESC,
        COALESCE(packages.budget, 0) DESC,
        packages.inserted_order ASC
      LIMIT ? OFFSET ?
    `,
    [...whereClause.params, normalizedQuery.pageSize, offset]
  );

  return { totalItems, page, pageSize: normalizedQuery.pageSize, totalPages, rows: rows.map(mapPackageRow) };
}

async function queryOwnerPackagesPage(db, ownerType, ownerName, normalizedQuery) {
  const whereClause = buildOwnerPackagesWhereClause(ownerType, ownerName, normalizedQuery);
  const countRow = await db.get(
    `
      SELECT COUNT(*) AS total
      FROM packages
      WHERE ${whereClause.sql}
    `,
    whereClause.params
  );
  const totalItems = countRow.total || 0;
  const totalPages = totalItems ? Math.ceil(totalItems / normalizedQuery.pageSize) : 1;
  const page = Math.min(normalizedQuery.page, totalPages);
  const offset = (page - 1) * normalizedQuery.pageSize;
  const rows = await db.all(
    `
      SELECT packages.*
      FROM packages
      WHERE ${whereClause.sql}
      ORDER BY
        packages.is_priority DESC,
        packages.potential_waste DESC,
        packages.risk_score DESC,
        COALESCE(packages.budget, 0) DESC,
        packages.inserted_order ASC
      LIMIT ? OFFSET ?
    `,
    [...whereClause.params, normalizedQuery.pageSize, offset]
  );

  return { totalItems, page, pageSize: normalizedQuery.pageSize, totalPages, rows: rows.map(mapPackageRow) };
}

async function getBootstrapPayload(db) {
  const summaryRow = await getNationalSummary(db);
  const regions = (await getRegionRows(db)).map(mapRegionRow);
  const provinces = (await getProvinceRows(db)).map(mapProvinceRow);
  const centralOwners = (await getOwnerRows(db, "central")).map(mapOwnerRow);

  return {
    summary: {
      totalPackages: summaryRow.total_packages || 0,
      totalPriorityPackages: summaryRow.total_priority_packages || 0,
      totalPotentialWaste: summaryRow.total_potential_waste || 0,
      totalBudget: summaryRow.total_budget || 0,
      unmappedPackages: summaryRow.unmapped_packages || 0,
      multiLocationPackages: summaryRow.multi_location_packages || 0,
    },
    legend: buildLegend(regions.map((region) => region.totalPotentialWaste)),
    geo: await getJsonAsset(db, "audit_geojson", { type: "FeatureCollection", features: [] }),
    regions,
    provinceView: {
      legend: buildLegend(provinces.map((province) => province.totalPotentialWaste)),
      geo: await getJsonAsset(db, "audit_province_geojson", { type: "FeatureCollection", features: [] }),
      provinces,
    },
    ownerLists: { central: centralOwners },
  };
}

async function getRegionPackages(db, regionKey, requestQuery) {
  const regionRow = await db.get(
    `
      SELECT regions.*, region_metrics.*
      FROM regions
      INNER JOIN region_metrics ON region_metrics.region_key = regions.region_key
      WHERE regions.region_key = ?
    `,
    [regionKey]
  );

  if (!regionRow) return null;

  const normalizedQuery = normalizeScopedPackageQuery(requestQuery);
  const pageResult = await queryPackagesPage(db, "package_regions", "package_regions.region_key", regionKey, normalizedQuery);

  return {
    region: mapRegionRow(regionRow),
    summary: { totalItems: pageResult.totalItems, filteredItems: pageResult.totalItems },
    pagination: {
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: pageResult.totalPages,
    },
    filters: {
      search: normalizedQuery.search,
      ownerType: normalizedQuery.ownerType,
      severity: normalizedQuery.severity,
      priorityOnly: normalizedQuery.priorityOnly,
    },
    items: pageResult.rows,
  };
}

async function getProvincePackages(db, provinceKey, requestQuery) {
  const provinceRow = await db.get(
    `
      SELECT provinces.*, province_metrics.*
      FROM provinces
      INNER JOIN province_metrics ON province_metrics.province_key = provinces.province_key
      WHERE provinces.province_key = ?
    `,
    [provinceKey]
  );

  if (!provinceRow) return null;

  const normalizedQuery = normalizeScopedPackageQuery(requestQuery, { allowOwnerType: false });
  const pageResult = await queryPackagesPage(
    db,
    "package_provinces",
    "package_provinces.province_key",
    provinceKey,
    normalizedQuery,
    { forcedOwnerType: "provinsi" }
  );

  return {
    province: mapProvinceRow(provinceRow),
    summary: { totalItems: pageResult.totalItems, filteredItems: pageResult.totalItems },
    pagination: {
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: pageResult.totalPages,
    },
    filters: {
      search: normalizedQuery.search,
      severity: normalizedQuery.severity,
      priorityOnly: normalizedQuery.priorityOnly,
    },
    items: pageResult.rows,
  };
}

async function getOwnerPackages(db, requestQuery) {
  const ownerType = (requestQuery.ownerType || "").trim();
  const ownerName = (requestQuery.ownerName || "").trim();

  if (!VALID_OWNER_TYPES.includes(ownerType) || !ownerName) return null;

  const ownerRow = await db.get(
    `
      SELECT *
      FROM owner_metrics
      WHERE owner_type = ?
        AND owner_name = ?
    `,
    [ownerType, ownerName]
  );

  if (!ownerRow) return null;

  const normalizedQuery = normalizeScopedPackageQuery(requestQuery, { allowOwnerType: false });
  const pageResult = await queryOwnerPackagesPage(db, ownerType, ownerName, normalizedQuery);

  return {
    owner: mapOwnerRow(ownerRow),
    summary: { totalItems: pageResult.totalItems, filteredItems: pageResult.totalItems },
    pagination: {
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: pageResult.totalPages,
    },
    filters: {
      search: normalizedQuery.search,
      severity: normalizedQuery.severity,
      priorityOnly: normalizedQuery.priorityOnly,
    },
    items: pageResult.rows,
  };
}

module.exports = {
  getBootstrapPayload,
  getOwnerPackages,
  getProvincePackages,
  getRegionPackages,
};
