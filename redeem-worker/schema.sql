CREATE TABLE IF NOT EXISTS code_redemptions (
  redemption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_tier TEXT NOT NULL,
  code_value TEXT NOT NULL,
  device_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_code_redemptions_tier_value
ON code_redemptions(code_tier, code_value);
