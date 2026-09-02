//! SQLite persistence (rusqlite, bundled, WAL). All methods are synchronous and
//! take the connection mutex; commands call them through `spawn_blocking`.

use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::riot::LeagueEntry;

// ---------------------------------------------------------------------------
// IPC types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSummary {
    pub match_id: String,
    pub game_datetime: i64,
    pub game_length: f64,
    pub game_version: String,
    pub queue_id: i64,
    pub game_type: String,
    pub set_number: i64,
    /// Riot participant object, passed through untouched (snake_case fields).
    pub participant: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankSnapshot {
    pub id: i64,
    pub puuid: String,
    pub queue_type: String,
    pub tier: String,
    pub rank: String,
    pub league_points: i64,
    pub wins: i64,
    pub losses: i64,
    pub captured_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStats {
    pub matches: i64,
    pub ladder_matches: i64,
    pub players: i64,
    pub size_bytes: u64,
}

/// Rows handed to the stats aggregator.
#[derive(Debug, Clone, Deserialize)]
pub struct StatsTrait {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub num_units: i64,
    #[serde(default)]
    pub style: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StatsUnit {
    #[serde(default)]
    pub character_id: String,
    #[serde(default, rename = "itemNames")]
    pub item_names: Vec<String>,
    #[serde(default)]
    pub tier: i64,
}

#[derive(Debug, Clone)]
pub struct StatsRow {
    pub placement: i64,
    pub level: i64,
    pub traits: Vec<StatsTrait>,
    pub units: Vec<StatsUnit>,
    pub augments: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct StatsLoad {
    pub set_number: i64,
    pub matches: usize,
    pub rows: Vec<StatsRow>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatsSource {
    Me,
    Ladder,
    All,
}

#[derive(Debug, Clone)]
pub struct StatsQuery {
    pub set_number: Option<i64>,
    pub source: StatsSource,
    pub puuid: Option<String>,
    pub queue_id: Option<i64>,
    pub days_back: Option<i64>,
}

// ---------------------------------------------------------------------------
// Db
// ---------------------------------------------------------------------------

pub struct Db {
    conn: Mutex<Connection>,
    path: PathBuf,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;

            CREATE TABLE IF NOT EXISTS matches (
                match_id      TEXT PRIMARY KEY,
                set_number    INTEGER,
                game_datetime INTEGER,
                game_length   REAL,
                game_version  TEXT,
                queue_id      INTEGER,
                game_type     TEXT,
                source        TEXT NOT NULL DEFAULT 'me',
                json          TEXT NOT NULL,
                inserted_at   INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_matches_set ON matches(set_number);
            CREATE INDEX IF NOT EXISTS idx_matches_source_set ON matches(source, set_number);
            CREATE INDEX IF NOT EXISTS idx_matches_datetime ON matches(game_datetime);

            CREATE TABLE IF NOT EXISTS participants (
                match_id           TEXT NOT NULL,
                puuid              TEXT NOT NULL,
                placement          INTEGER,
                level              INTEGER,
                gold_left          INTEGER,
                last_round         INTEGER,
                players_eliminated INTEGER,
                total_damage       INTEGER,
                game_datetime      INTEGER,
                set_number         INTEGER,
                queue_id           INTEGER,
                PRIMARY KEY (match_id, puuid)
            );
            CREATE INDEX IF NOT EXISTS idx_participants_puuid_dt ON participants(puuid, game_datetime DESC);
            CREATE INDEX IF NOT EXISTS idx_participants_set ON participants(set_number);

            CREATE TABLE IF NOT EXISTS player_matches (
                puuid    TEXT NOT NULL,
                match_id TEXT NOT NULL,
                PRIMARY KEY (puuid, match_id)
            );
            CREATE INDEX IF NOT EXISTS idx_player_matches_match ON player_matches(match_id);

            CREATE TABLE IF NOT EXISTS rank_snapshots (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                puuid         TEXT NOT NULL,
                queue_type    TEXT NOT NULL,
                tier          TEXT NOT NULL,
                rank          TEXT NOT NULL,
                league_points INTEGER NOT NULL,
                wins          INTEGER NOT NULL,
                losses        INTEGER NOT NULL,
                captured_at   INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rank_snapshots_key ON rank_snapshots(puuid, queue_type, captured_at DESC);

            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
            "#,
        )?;
        Ok(Self { conn: Mutex::new(conn), path: path.to_path_buf() })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    // ----- kv ---------------------------------------------------------------

    pub fn kv_get(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.conn.lock();
        Ok(conn
            .query_row("SELECT value FROM kv WHERE key = ?1", params![key], |r| r.get::<_, String>(0))
            .optional()?)
    }

    pub fn kv_set(&self, key: &str, value: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO kv(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    // ----- matches ----------------------------------------------------------

    pub fn has_match(&self, match_id: &str) -> AppResult<bool> {
        let conn = self.conn.lock();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM matches WHERE match_id = ?1", params![match_id], |r| r.get(0))?;
        Ok(n > 0)
    }

    /// Stores a match. Returns `true` if it was newly inserted. An existing
    /// 'ladder' row is upgraded to 'me' when re-inserted with source 'me'.
    pub fn insert_match(&self, match_id: &str, json: &Value, source: &str) -> AppResult<bool> {
        let info = json.get("info").ok_or_else(|| AppError::Json("match JSON has no info".into()))?;
        let set_number = info.get("tft_set_number").and_then(Value::as_i64).unwrap_or(0);
        let game_datetime = info.get("game_datetime").and_then(Value::as_i64).unwrap_or(0);
        let game_length = info.get("game_length").and_then(Value::as_f64).unwrap_or(0.0);
        let game_version = info.get("game_version").and_then(Value::as_str).unwrap_or("").to_string();
        let queue_id = info.get("queue_id").and_then(Value::as_i64).unwrap_or(0);
        let game_type = info.get("tft_game_type").and_then(Value::as_str).unwrap_or("").to_string();
        let participants = info.get("participants").and_then(Value::as_array).cloned().unwrap_or_default();

        let mut conn = self.conn.lock();
        let existing: Option<String> = conn
            .query_row("SELECT source FROM matches WHERE match_id = ?1", params![match_id], |r| r.get(0))
            .optional()?;
        if let Some(existing_source) = existing {
            if existing_source == "ladder" && source == "me" {
                conn.execute("UPDATE matches SET source = 'me' WHERE match_id = ?1", params![match_id])?;
            }
            return Ok(false);
        }

        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO matches(match_id, set_number, game_datetime, game_length, game_version, queue_id, game_type, source, json, inserted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                match_id,
                set_number,
                game_datetime,
                game_length,
                game_version,
                queue_id,
                game_type,
                source,
                serde_json::to_string(json)?,
                now_ms()
            ],
        )?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR REPLACE INTO participants(match_id, puuid, placement, level, gold_left, last_round, players_eliminated, total_damage, game_datetime, set_number, queue_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            )?;
            for p in &participants {
                let puuid = p.get("puuid").and_then(Value::as_str).unwrap_or("");
                if puuid.is_empty() {
                    continue;
                }
                stmt.execute(params![
                    match_id,
                    puuid,
                    p.get("placement").and_then(Value::as_i64).unwrap_or(0),
                    p.get("level").and_then(Value::as_i64).unwrap_or(0),
                    p.get("gold_left").and_then(Value::as_i64).unwrap_or(0),
                    p.get("last_round").and_then(Value::as_i64).unwrap_or(0),
                    p.get("players_eliminated").and_then(Value::as_i64).unwrap_or(0),
                    p.get("total_damage_to_players").and_then(Value::as_i64).unwrap_or(0),
                    game_datetime,
                    set_number,
                    queue_id,
                ])?;
            }
        }
        tx.commit()?;
        Ok(true)
    }

    pub fn link_player_match(&self, puuid: &str, match_id: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR IGNORE INTO player_matches(puuid, match_id) VALUES (?1, ?2)",
            params![puuid, match_id],
        )?;
        Ok(())
    }

    pub fn list_matches(
        &self,
        puuid: &str,
        limit: i64,
        offset: i64,
        set_number: Option<i64>,
        queue_id: Option<i64>,
    ) -> AppResult<Vec<MatchSummary>> {
        let conn = self.conn.lock();
        let mut sql = String::from(
            "SELECT m.match_id, m.game_datetime, m.game_length, m.game_version, m.queue_id, m.game_type, m.set_number, m.json
             FROM participants p JOIN matches m ON m.match_id = p.match_id
             WHERE p.puuid = ?1",
        );
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(puuid.to_string())];
        if let Some(s) = set_number {
            args.push(Box::new(s));
            sql.push_str(&format!(" AND m.set_number = ?{}", args.len()));
        }
        if let Some(q) = queue_id {
            args.push(Box::new(q));
            sql.push_str(&format!(" AND m.queue_id = ?{}", args.len()));
        }
        args.push(Box::new(limit.max(0)));
        sql.push_str(&format!(" ORDER BY m.game_datetime DESC LIMIT ?{}", args.len()));
        args.push(Box::new(offset.max(0)));
        sql.push_str(&format!(" OFFSET ?{}", args.len()));

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(args.iter().map(|a| a.as_ref())), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, String>(7)?,
            ))
        })?;

        let mut out = Vec::new();
        for row in rows {
            let (match_id, game_datetime, game_length, game_version, queue_id, game_type, set_number, json) = row?;
            let v: Value = serde_json::from_str(&json)?;
            let participant = v
                .pointer("/info/participants")
                .and_then(Value::as_array)
                .and_then(|arr| arr.iter().find(|p| p.get("puuid").and_then(Value::as_str) == Some(puuid)))
                .cloned()
                .unwrap_or(Value::Null);
            out.push(MatchSummary {
                match_id,
                game_datetime,
                game_length,
                game_version,
                queue_id,
                game_type,
                set_number,
                participant,
            });
        }
        Ok(out)
    }

    pub fn count_matches(&self, puuid: &str) -> AppResult<i64> {
        let conn = self.conn.lock();
        Ok(conn.query_row("SELECT COUNT(*) FROM participants WHERE puuid = ?1", params![puuid], |r| r.get(0))?)
    }

    pub fn get_match(&self, match_id: &str) -> AppResult<Value> {
        let conn = self.conn.lock();
        let json: Option<String> = conn
            .query_row("SELECT json FROM matches WHERE match_id = ?1", params![match_id], |r| r.get(0))
            .optional()?;
        match json {
            Some(j) => Ok(serde_json::from_str(&j)?),
            None => Err(AppError::NotFound(format!("試合が見つかりません: {match_id}"))),
        }
    }

    pub fn count_ladder_matches(&self, set_number: Option<i64>) -> AppResult<i64> {
        let conn = self.conn.lock();
        Ok(match set_number {
            Some(s) => conn.query_row(
                "SELECT COUNT(*) FROM matches WHERE source = 'ladder' AND set_number = ?1",
                params![s],
                |r| r.get(0),
            )?,
            None => conn.query_row("SELECT COUNT(*) FROM matches WHERE source = 'ladder'", [], |r| r.get(0))?,
        })
    }

    /// Deletes ladder-sourced matches that no tracked player fetched. Returns rows removed.
    pub fn clear_ladder_matches(&self) -> AppResult<i64> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM participants WHERE match_id IN (
                SELECT match_id FROM matches WHERE source = 'ladder'
                AND match_id NOT IN (SELECT match_id FROM player_matches))",
            [],
        )?;
        let n = tx.execute(
            "DELETE FROM matches WHERE source = 'ladder' AND match_id NOT IN (SELECT match_id FROM player_matches)",
            [],
        )?;
        tx.commit()?;
        Ok(n as i64)
    }

    // ----- rank snapshots ---------------------------------------------------

    /// Inserts a snapshot only if it differs from the latest one for (puuid, queue_type).
    pub fn record_rank_snapshot(&self, puuid: &str, entry: &LeagueEntry) -> AppResult<bool> {
        let tier = entry.tier.clone().or_else(|| entry.rated_tier.clone()).unwrap_or_default();
        let rank = entry.rank.clone().unwrap_or_default();
        let lp = if entry.tier.is_some() { entry.league_points } else { entry.rated_rating.unwrap_or(entry.league_points) };
        let conn = self.conn.lock();
        let latest: Option<(String, String, i64, i64, i64)> = conn
            .query_row(
                "SELECT tier, rank, league_points, wins, losses FROM rank_snapshots
                 WHERE puuid = ?1 AND queue_type = ?2 ORDER BY captured_at DESC, id DESC LIMIT 1",
                params![puuid, entry.queue_type],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()?;
        if let Some((t, rk, l, w, lo)) = latest {
            if t == tier && rk == rank && l == lp && w == entry.wins && lo == entry.losses {
                return Ok(false);
            }
        }
        conn.execute(
            "INSERT INTO rank_snapshots(puuid, queue_type, tier, rank, league_points, wins, losses, captured_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![puuid, entry.queue_type, tier, rank, lp, entry.wins, entry.losses, now_ms()],
        )?;
        Ok(true)
    }

    pub fn list_rank_snapshots(&self, puuid: &str, queue_type: Option<&str>) -> AppResult<Vec<RankSnapshot>> {
        let conn = self.conn.lock();
        let map = |r: &rusqlite::Row| -> rusqlite::Result<RankSnapshot> {
            Ok(RankSnapshot {
                id: r.get(0)?,
                puuid: r.get(1)?,
                queue_type: r.get(2)?,
                tier: r.get(3)?,
                rank: r.get(4)?,
                league_points: r.get(5)?,
                wins: r.get(6)?,
                losses: r.get(7)?,
                captured_at: r.get(8)?,
            })
        };
        let cols = "id, puuid, queue_type, tier, rank, league_points, wins, losses, captured_at";
        let out = match queue_type {
            Some(q) => {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {cols} FROM rank_snapshots WHERE puuid = ?1 AND queue_type = ?2 ORDER BY captured_at ASC, id ASC"
                ))?;
                let rows = stmt.query_map(params![puuid, q], map)?;
                rows.collect::<rusqlite::Result<Vec<_>>>()?
            }
            None => {
                let mut stmt = conn.prepare(&format!(
                    "SELECT {cols} FROM rank_snapshots WHERE puuid = ?1 ORDER BY captured_at ASC, id ASC"
                ))?;
                let rows = stmt.query_map(params![puuid], map)?;
                rows.collect::<rusqlite::Result<Vec<_>>>()?
            }
        };
        Ok(out)
    }

    // ----- stats ------------------------------------------------------------

    pub fn db_stats(&self) -> AppResult<DbStats> {
        let conn = self.conn.lock();
        let matches: i64 = conn.query_row("SELECT COUNT(*) FROM matches", [], |r| r.get(0))?;
        let ladder_matches: i64 = conn.query_row("SELECT COUNT(*) FROM matches WHERE source = 'ladder'", [], |r| r.get(0))?;
        let players: i64 = conn.query_row("SELECT COUNT(DISTINCT puuid) FROM player_matches", [], |r| r.get(0))?;
        drop(conn);
        let mut size_bytes = 0u64;
        for suffix in ["", "-wal", "-shm"] {
            let mut p = self.path.as_os_str().to_owned();
            p.push(suffix);
            if let Ok(md) = std::fs::metadata(PathBuf::from(p)) {
                size_bytes += md.len();
            }
        }
        Ok(DbStats { matches, ladder_matches, players, size_bytes })
    }

    /// Loads participant rows for stats aggregation, parsing each match JSON once.
    pub fn load_participants_for_stats(&self, q: &StatsQuery) -> AppResult<StatsLoad> {
        if q.source == StatsSource::Me && q.puuid.as_deref().unwrap_or("").is_empty() {
            return Err(AppError::other("source=me には puuid が必要です"));
        }
        let conn = self.conn.lock();

        // Resolve set number: explicit, else latest present under the same source filter.
        let set_number = match q.set_number {
            Some(s) => s,
            None => {
                let latest: Option<i64> = match q.source {
                    StatsSource::Me => conn.query_row(
                        "SELECT MAX(set_number) FROM participants WHERE puuid = ?1",
                        params![q.puuid.as_deref().unwrap_or("")],
                        |r| r.get(0),
                    )?,
                    StatsSource::Ladder => conn.query_row(
                        "SELECT MAX(set_number) FROM matches WHERE source = 'ladder'",
                        [],
                        |r| r.get(0),
                    )?,
                    StatsSource::All => conn.query_row("SELECT MAX(set_number) FROM matches", [], |r| r.get(0))?,
                };
                match latest {
                    Some(s) => s,
                    None => return Ok(StatsLoad::default()),
                }
            }
        };

        let mut sql = String::from("SELECT m.json FROM matches m WHERE m.set_number = ?1");
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(set_number)];
        match q.source {
            StatsSource::Me => {
                args.push(Box::new(q.puuid.clone().unwrap_or_default()));
                sql.push_str(&format!(
                    " AND EXISTS (SELECT 1 FROM participants p WHERE p.match_id = m.match_id AND p.puuid = ?{})",
                    args.len()
                ));
            }
            StatsSource::Ladder => sql.push_str(" AND m.source = 'ladder'"),
            StatsSource::All => {}
        }
        if let Some(qid) = q.queue_id {
            args.push(Box::new(qid));
            sql.push_str(&format!(" AND m.queue_id = ?{}", args.len()));
        }
        if let Some(days) = q.days_back {
            if days > 0 {
                let since = now_ms() - days * 86_400_000;
                args.push(Box::new(since));
                sql.push_str(&format!(" AND m.game_datetime >= ?{}", args.len()));
            }
        }

        let mut stmt = conn.prepare(&sql)?;
        let jsons = stmt
            .query_map(rusqlite::params_from_iter(args.iter().map(|a| a.as_ref())), |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?;
        drop(stmt);
        drop(conn);

        let only_puuid = if q.source == StatsSource::Me { q.puuid.clone() } else { None };
        let mut rows = Vec::new();
        let mut matches = 0usize;
        for json in jsons {
            let v: Value = match serde_json::from_str(&json) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let Some(parts) = v.pointer("/info/participants").and_then(Value::as_array) else { continue };
            matches += 1;
            for p in parts {
                if let Some(only) = &only_puuid {
                    if p.get("puuid").and_then(Value::as_str) != Some(only.as_str()) {
                        continue;
                    }
                }
                let traits: Vec<StatsTrait> = p
                    .get("traits")
                    .cloned()
                    .map(|t| serde_json::from_value(t).unwrap_or_default())
                    .unwrap_or_default();
                let units: Vec<StatsUnit> = p
                    .get("units")
                    .cloned()
                    .map(|u| serde_json::from_value(u).unwrap_or_default())
                    .unwrap_or_default();
                let augments: Vec<String> = p
                    .get("augments")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                rows.push(StatsRow {
                    placement: p.get("placement").and_then(Value::as_i64).unwrap_or(0),
                    level: p.get("level").and_then(Value::as_i64).unwrap_or(0),
                    traits,
                    units,
                    augments,
                });
            }
        }
        Ok(StatsLoad { set_number, matches, rows })
    }
}
