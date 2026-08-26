CREATE TABLE IF NOT EXISTS code_redemptions (
  redemption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_tier TEXT NOT NULL,
  code_value TEXT NOT NULL,
  device_uuid TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Unique per (code, device): enforces one row per device per code, which is
-- both how the guest-code cap counts distinct devices and how a same-device
-- retry becomes a harmless no-op (INSERT OR IGNORE) instead of a duplicate
-- redemption. Also serves lookups on the (code_tier, code_value) prefix.
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_redemptions_tier_value_device
ON code_redemptions(code_tier, code_value, device_uuid);
