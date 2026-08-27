CREATE TABLE IF NOT EXISTS players (
  player_id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_uuid TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  opt_in INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS score_submissions (
  submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  run_number INTEGER NOT NULL,
  content_version TEXT NOT NULL,
  run_mode TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  week_key TEXT NOT NULL,
  score_fp INTEGER NOT NULL,
  answers_json TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 1,
  reject_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(player_id)
);

CREATE INDEX IF NOT EXISTS idx_score_submissions_player_created
ON score_submissions(player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_score_submissions_week_key
ON score_submissions(week_key);

CREATE TABLE IF NOT EXISTS leaderboard_best (
  player_id INTEGER NOT NULL,
  window_type TEXT NOT NULL,
  week_key TEXT NOT NULL,
  best_score_fp INTEGER NOT NULL,
  best_submission_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, window_type, week_key),
  FOREIGN KEY (player_id) REFERENCES players(player_id),
  FOREIGN KEY (best_submission_id) REFERENCES score_submissions(submission_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_best_window_score
ON leaderboard_best(window_type, week_key, best_score_fp DESC, updated_at ASC);

