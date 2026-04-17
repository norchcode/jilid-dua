CREATE TABLE IF NOT EXISTS assets (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regions (
  region_key TEXT PRIMARY KEY,
  code TEXT,
  province_name TEXT NOT NULL,
  region_name TEXT NOT NULL,
  region_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  feature_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provinces (
  province_key TEXT PRIMARY KEY,
  code TEXT,
  province_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  feature_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  source_id BIGINT,
  schema_version TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  satker TEXT,
  package_name TEXT NOT NULL,
  procurement_type TEXT,
  procurement_method TEXT,
  location_raw TEXT NOT NULL,
  budget DOUBLE PRECISION,
  selection_date TEXT,
  funding_source TEXT,
  is_umkm INTEGER NOT NULL,
  within_country INTEGER NOT NULL,
  volume TEXT,
  work_description TEXT,
  specification TEXT,
  potential_waste DOUBLE PRECISION NOT NULL,
  severity TEXT NOT NULL,
  reason TEXT,
  is_mencurigakan INTEGER,
  is_pemborosan INTEGER,
  risk_score INTEGER NOT NULL,
  active_tag_count INTEGER NOT NULL,
  is_priority INTEGER NOT NULL,
  is_flagged INTEGER NOT NULL,
  mapped_region_count INTEGER NOT NULL,
  inserted_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS package_regions (
  package_id TEXT NOT NULL,
  region_key TEXT NOT NULL,
  PRIMARY KEY (package_id, region_key),
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  FOREIGN KEY (region_key) REFERENCES regions(region_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS package_provinces (
  package_id TEXT NOT NULL,
  province_key TEXT NOT NULL,
  PRIMARY KEY (package_id, province_key),
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  FOREIGN KEY (province_key) REFERENCES provinces(province_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS region_metrics (
  region_key TEXT PRIMARY KEY,
  total_packages INTEGER NOT NULL,
  total_priority_packages INTEGER NOT NULL,
  total_flagged_packages INTEGER NOT NULL,
  total_potential_waste DOUBLE PRECISION NOT NULL,
  total_budget DOUBLE PRECISION NOT NULL,
  avg_risk_score DOUBLE PRECISION NOT NULL,
  max_risk_score INTEGER NOT NULL,
  central_packages INTEGER NOT NULL,
  provincial_packages INTEGER NOT NULL,
  local_packages INTEGER NOT NULL,
  other_packages INTEGER NOT NULL,
  central_priority_packages INTEGER NOT NULL,
  provincial_priority_packages INTEGER NOT NULL,
  local_priority_packages INTEGER NOT NULL,
  other_priority_packages INTEGER NOT NULL,
  central_potential_waste DOUBLE PRECISION NOT NULL,
  provincial_potential_waste DOUBLE PRECISION NOT NULL,
  local_potential_waste DOUBLE PRECISION NOT NULL,
  other_potential_waste DOUBLE PRECISION NOT NULL,
  central_budget DOUBLE PRECISION NOT NULL,
  provincial_budget DOUBLE PRECISION NOT NULL,
  local_budget DOUBLE PRECISION NOT NULL,
  other_budget DOUBLE PRECISION NOT NULL,
  med_severity_packages INTEGER NOT NULL,
  high_severity_packages INTEGER NOT NULL,
  absurd_severity_packages INTEGER NOT NULL,
  FOREIGN KEY (region_key) REFERENCES regions(region_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS province_metrics (
  province_key TEXT PRIMARY KEY,
  total_packages INTEGER NOT NULL,
  total_priority_packages INTEGER NOT NULL,
  total_flagged_packages INTEGER NOT NULL,
  total_potential_waste DOUBLE PRECISION NOT NULL,
  total_budget DOUBLE PRECISION NOT NULL,
  avg_risk_score DOUBLE PRECISION NOT NULL,
  max_risk_score INTEGER NOT NULL,
  med_severity_packages INTEGER NOT NULL,
  high_severity_packages INTEGER NOT NULL,
  absurd_severity_packages INTEGER NOT NULL,
  FOREIGN KEY (province_key) REFERENCES provinces(province_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS owner_metrics (
  owner_type TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  total_packages INTEGER NOT NULL,
  total_priority_packages INTEGER NOT NULL,
  total_flagged_packages INTEGER NOT NULL,
  total_potential_waste DOUBLE PRECISION NOT NULL,
  total_budget DOUBLE PRECISION NOT NULL,
  med_severity_packages INTEGER NOT NULL,
  high_severity_packages INTEGER NOT NULL,
  absurd_severity_packages INTEGER NOT NULL,
  PRIMARY KEY (owner_type, owner_name)
);

CREATE INDEX IF NOT EXISTS idx_packages_priority_order
  ON packages(is_priority, potential_waste DESC, risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_packages_owner_type
  ON packages(owner_type);

CREATE INDEX IF NOT EXISTS idx_packages_owner_lookup
  ON packages(owner_type, owner_name);

CREATE INDEX IF NOT EXISTS idx_packages_severity
  ON packages(severity);

CREATE INDEX IF NOT EXISTS idx_package_regions_region
  ON package_regions(region_key, package_id);

CREATE INDEX IF NOT EXISTS idx_package_provinces_province
  ON package_provinces(province_key, package_id);
