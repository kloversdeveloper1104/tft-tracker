//! Tauri commands. Names and argument names match `src/lib/api.ts`
//! (JS camelCase args map to these snake_case parameters).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::cdragon::{CdragonCache, StaticData, StaticDataMeta};
use crate::db::{Db, DbStats, MatchSummary, RankSnapshot, StatsQuery};
use crate::error::{AppError, AppResult};
use crate::overlay;
use crate::riot::{Account, LeagueEntry, RiotClient, RiotState, Summoner};
use crate::stats::{self, StatsFilter, StatsResult};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct Paths {
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CollectStatus {
    pub running: bool,
    pub phase: String,
    pub done: i64,
    pub total: i64,
    pub added: i64,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectOptions {
    #[serde(default)]
    pub tiers: Vec<String>,
    #[serde(default = "default_players_limit")]
    pub players_limit: usize,
    #[serde(default = "default_matches_per_player")]
    pub matches_per_player: usize,
    #[serde(default)]
    pub queue_id: Option<i64>,
}

fn default_players_limit() -> usize {
    50
}
fn default_matches_per_player() -> usize {
    10
}

pub struct CollectState {
    pub running: AtomicBool,
    pub cancel: AtomicBool,
    pub status: parking_lot::Mutex<CollectStatus>,
}

impl Default for CollectState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            status: parking_lot::Mutex::new(CollectStatus { phase: "idle".into(), ..Default::default() }),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub fetched: i64,
    pub added: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub done: i64,
    pub total: i64,
    pub message: String,
}

pub const EVENT_SYNC_PROGRESS: &str = "sync-progress";
pub const EVENT_COLLECT_PROGRESS: &str = "collect-progress";

async fn blocking<T, F>(f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await?
}

// ---------------------------------------------------------------------------
// Riot
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn configure_riot(api_key: String, platform: String, riot: State<'_, RiotState>) -> AppResult<()> {
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        *riot.0.write() = None;
        return Ok(());
    }
    let client = RiotClient::new(api_key, platform.trim().to_ascii_lowercase())?;
    *riot.0.write() = Some(Arc::new(client));
    Ok(())
}

#[tauri::command]
pub async fn resolve_account(game_name: String, tag_line: String, riot: State<'_, RiotState>) -> AppResult<Account> {
    let client = riot.client()?;
    client.account_by_riot_id(&game_name, &tag_line).await
}

#[tauri::command]
pub async fn get_summoner(puuid: String, riot: State<'_, RiotState>) -> AppResult<Summoner> {
    let client = riot.client()?;
    client.summoner_by_puuid(&puuid).await
}

#[tauri::command]
pub async fn get_league(puuid: String, riot: State<'_, RiotState>, db: State<'_, Arc<Db>>) -> AppResult<Vec<LeagueEntry>> {
    let client = riot.client()?;
    let entries = client.league_by_puuid(&puuid).await?;
    let db = db.inner().clone();
    let snapshot_entries = entries.clone();
    let p = puuid.clone();
    blocking(move || {
        for e in &snapshot_entries {
            if e.queue_type.is_empty() {
                continue;
            }
            db.record_rank_snapshot(&p, e)?;
        }
        Ok(())
    })
    .await?;
    Ok(entries)
}

#[tauri::command]
pub async fn list_rank_snapshots(puuid: String, queue_type: Option<String>, db: State<'_, Arc<Db>>) -> AppResult<Vec<RankSnapshot>> {
    let db = db.inner().clone();
    blocking(move || db.list_rank_snapshots(&puuid, queue_type.as_deref())).await
}

#[tauri::command]
pub async fn sync_matches(
    app: AppHandle,
    puuid: String,
    count: Option<usize>,
    riot: State<'_, RiotState>,
    db: State<'_, Arc<Db>>,
) -> AppResult<SyncResult> {
    let client = riot.client()?;
    let db = db.inner().clone();
    let count = count.unwrap_or(20).clamp(1, 1000);

    let _ = app.emit(EVENT_SYNC_PROGRESS, SyncProgress { done: 0, total: 0, message: "試合IDを取得中…".into() });
    let ids = client.match_ids(&puuid, count).await?;
    let total = ids.len() as i64;
    let mut fetched = 0i64;
    let mut added = 0i64;

    for (idx, id) in ids.iter().enumerate() {
        let db2 = db.clone();
        let id2 = id.clone();
        let exists = blocking(move || db2.has_match(&id2)).await?;
        if !exists {
            let json: Value = client.match_by_id(id).await?;
            fetched += 1;
            let db2 = db.clone();
            let id2 = id.clone();
            let inserted = blocking(move || db2.insert_match(&id2, &json, "me")).await?;
            if inserted {
                added += 1;
            }
        } else {
            // Upgrade a ladder-sourced copy to 'me' without re-fetching.
            let db2 = db.clone();
            let id2 = id.clone();
            blocking(move || {
                if let Ok(json) = db2.get_match(&id2) {
                    db2.insert_match(&id2, &json, "me")?;
                }
                Ok(())
            })
            .await?;
        }
        let db2 = db.clone();
        let (p2, id2) = (puuid.clone(), id.clone());
        blocking(move || db2.link_player_match(&p2, &id2)).await?;

        let _ = app.emit(
            EVENT_SYNC_PROGRESS,
            SyncProgress {
                done: idx as i64 + 1,
                total,
                message: if exists { format!("{} は保存済み", id) } else { format!("{} を保存しました", id) },
            },
        );
    }

    let db2 = db.clone();
    let p2 = puuid.clone();
    let total_stored = blocking(move || db2.count_matches(&p2)).await?;
    let _ = app.emit(EVENT_SYNC_PROGRESS, SyncProgress { done: total, total, message: "同期完了".into() });
    Ok(SyncResult { fetched, added, total: total_stored })
}

#[tauri::command]
pub async fn list_matches(
    puuid: String,
    limit: Option<i64>,
    offset: Option<i64>,
    set_number: Option<i64>,
    queue_id: Option<i64>,
    db: State<'_, Arc<Db>>,
) -> AppResult<Vec<MatchSummary>> {
    let db = db.inner().clone();
    blocking(move || db.list_matches(&puuid, limit.unwrap_or(50), offset.unwrap_or(0), set_number, queue_id)).await
}

#[tauri::command]
pub async fn count_matches(puuid: String, db: State<'_, Arc<Db>>) -> AppResult<i64> {
    let db = db.inner().clone();
    blocking(move || db.count_matches(&puuid)).await
}

#[tauri::command]
pub async fn get_match(match_id: String, db: State<'_, Arc<Db>>) -> AppResult<Value> {
    let db = db.inner().clone();
    blocking(move || db.get_match(&match_id)).await
}

// ---------------------------------------------------------------------------
// Ladder collection
// ---------------------------------------------------------------------------

fn set_status(app: &AppHandle, state: &CollectState, status: CollectStatus) {
    *state.status.lock() = status.clone();
    let _ = app.emit(EVENT_COLLECT_PROGRESS, status);
}

async fn run_collect(app: AppHandle, client: Arc<RiotClient>, db: Arc<Db>, state: Arc<CollectState>, opts: CollectOptions) -> AppResult<i64> {
    let queue_id = opts.queue_id.unwrap_or(1100);
    let tiers: Vec<String> = if opts.tiers.is_empty() {
        vec!["challenger".into()]
    } else {
        opts.tiers.iter().map(|t| t.to_ascii_lowercase()).collect()
    };
    let check_cancel = |state: &CollectState| -> AppResult<()> {
        if state.cancel.load(Ordering::SeqCst) { Err(AppError::Cancelled) } else { Ok(()) }
    };

    // Phase 1: ladder
    let mut players: Vec<(String, i64)> = Vec::new();
    for (i, tier) in tiers.iter().enumerate() {
        check_cancel(&state)?;
        set_status(
            &app,
            &state,
            CollectStatus {
                running: true,
                phase: "ladder".into(),
                done: i as i64,
                total: tiers.len() as i64,
                added: 0,
                message: format!("{tier} ラダーを取得中…"),
            },
        );
        let entries = client.ladder(tier).await?;
        for e in entries {
            let puuid = match e.puuid {
                Some(p) if !p.is_empty() => p,
                _ => match e.summoner_id.as_deref() {
                    Some(id) if !id.is_empty() => match client.summoner_by_id(id).await {
                        Ok(s) => s.puuid,
                        Err(err) => {
                            log::warn!("summoner lookup failed for {id}: {err}");
                            continue;
                        }
                    },
                    _ => continue,
                },
            };
            players.push((puuid, e.league_points));
        }
    }
    players.sort_by(|a, b| b.1.cmp(&a.1));
    players.dedup_by(|a, b| a.0 == b.0);
    players.truncate(opts.players_limit.max(1));

    // Phase 2: matches
    let total = players.len() as i64;
    let mut added = 0i64;
    let per_player = opts.matches_per_player.clamp(1, 200);
    for (i, (puuid, _lp)) in players.iter().enumerate() {
        check_cancel(&state)?;
        set_status(
            &app,
            &state,
            CollectStatus {
                running: true,
                phase: "matches".into(),
                done: i as i64,
                total,
                added,
                message: format!("プレイヤー {}/{} の試合を取得中…", i + 1, total),
            },
        );
        let ids = match client.match_ids(puuid, per_player).await {
            Ok(ids) => ids,
            Err(AppError::NotFound(_)) => continue,
            Err(e) => return Err(e),
        };
        for (j, id) in ids.iter().enumerate() {
            check_cancel(&state)?;
            let db2 = db.clone();
            let id2 = id.clone();
            if blocking(move || db2.has_match(&id2)).await? {
                continue;
            }
            let json = match client.match_by_id(id).await {
                Ok(j) => j,
                Err(AppError::NotFound(_)) => continue,
                Err(e) => return Err(e),
            };
            let q = json.pointer("/info/queue_id").and_then(Value::as_i64).unwrap_or(0);
            if q != queue_id {
                continue;
            }
            let db2 = db.clone();
            let id2 = id.clone();
            if blocking(move || db2.insert_match(&id2, &json, "ladder")).await? {
                added += 1;
            }
            if (j + 1) % 5 == 0 {
                set_status(
                    &app,
                    &state,
                    CollectStatus {
                        running: true,
                        phase: "matches".into(),
                        done: i as i64,
                        total,
                        added,
                        message: format!("プレイヤー {}/{}: {}/{} 試合", i + 1, total, j + 1, ids.len()),
                    },
                );
            }
        }
    }
    Ok(added)
}

#[tauri::command]
pub async fn collect_ladder(
    app: AppHandle,
    opts: CollectOptions,
    riot: State<'_, RiotState>,
    db: State<'_, Arc<Db>>,
    collect: State<'_, Arc<CollectState>>,
) -> AppResult<()> {
    let client = riot.client()?;
    let state = collect.inner().clone();
    if state.running.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err(AppError::other("ラダー収集はすでに実行中です"));
    }
    state.cancel.store(false, Ordering::SeqCst);
    set_status(
        &app,
        &state,
        CollectStatus { running: true, phase: "ladder".into(), done: 0, total: 0, added: 0, message: "開始します…".into() },
    );

    let db = db.inner().clone();
    tauri::async_runtime::spawn(async move {
        let result = run_collect(app.clone(), client, db, state.clone(), opts).await;
        let prev = state.status.lock().clone();
        let final_status = match result {
            Ok(added) => CollectStatus {
                running: false,
                phase: "done".into(),
                done: prev.total,
                total: prev.total,
                added,
                message: format!("完了: {added} 試合を追加しました"),
            },
            Err(AppError::Cancelled) => CollectStatus {
                running: false,
                phase: "cancelled".into(),
                done: prev.done,
                total: prev.total,
                added: prev.added,
                message: "キャンセルしました".into(),
            },
            Err(e) => CollectStatus {
                running: false,
                phase: "error".into(),
                done: prev.done,
                total: prev.total,
                added: prev.added,
                message: e.to_string(),
            },
        };
        state.running.store(false, Ordering::SeqCst);
        set_status(&app, &state, final_status);
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_collect(collect: State<'_, Arc<CollectState>>) -> AppResult<()> {
    collect.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn get_collect_status(collect: State<'_, Arc<CollectState>>) -> AppResult<CollectStatus> {
    Ok(collect.status.lock().clone())
}

#[tauri::command]
pub async fn count_ladder_matches(set_number: Option<i64>, db: State<'_, Arc<Db>>) -> AppResult<i64> {
    let db = db.inner().clone();
    blocking(move || db.count_ladder_matches(set_number)).await
}

#[tauri::command]
pub async fn clear_ladder_matches(db: State<'_, Arc<Db>>) -> AppResult<()> {
    let db = db.inner().clone();
    blocking(move || db.clear_ladder_matches().map(|_| ())).await
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_stats(filter: StatsFilter, db: State<'_, Arc<Db>>) -> AppResult<StatsResult> {
    let db = db.inner().clone();
    blocking(move || {
        let q = StatsQuery {
            set_number: filter.set_number,
            source: filter.source(),
            puuid: filter.puuid.clone(),
            queue_id: filter.queue_id,
            days_back: filter.days_back,
        };
        let load = db.load_participants_for_stats(&q)?;
        Ok(stats::compute(load, filter.min_games.unwrap_or(3)))
    })
    .await
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_static_meta(cdragon: State<'_, Arc<CdragonCache>>) -> AppResult<StaticDataMeta> {
    cdragon.meta(None).await
}

#[tauri::command]
pub async fn get_static_data(locale: String, set_number: Option<i64>, cdragon: State<'_, Arc<CdragonCache>>) -> AppResult<StaticData> {
    cdragon.static_data(&locale, set_number).await
}

#[tauri::command]
pub async fn refresh_static_data(locale: String, cdragon: State<'_, Arc<CdragonCache>>) -> AppResult<StaticDataMeta> {
    cdragon.refresh(&locale).await
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn toggle_overlay(app: AppHandle) -> AppResult<bool> {
    overlay::toggle(&app)
}

#[tauri::command]
pub async fn open_overlay(app: AppHandle) -> AppResult<()> {
    overlay::open(&app)
}

#[tauri::command]
pub async fn close_overlay(app: AppHandle) -> AppResult<()> {
    overlay::close(&app)
}

#[tauri::command]
pub fn is_overlay_open(app: AppHandle) -> AppResult<bool> {
    Ok(overlay::is_open(&app))
}

#[tauri::command]
pub async fn set_overlay_click_through(app: AppHandle, enabled: bool) -> AppResult<()> {
    overlay::set_click_through(&app, enabled)
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_data_dir(paths: State<'_, Paths>) -> AppResult<String> {
    Ok(paths.data_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn clear_cache(paths: State<'_, Paths>) -> AppResult<()> {
    let dir = paths.cache_dir.clone();
    blocking(move || {
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        std::fs::create_dir_all(&dir)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn db_stats(db: State<'_, Arc<Db>>) -> AppResult<DbStats> {
    let db = db.inner().clone();
    blocking(move || db.db_stats()).await
}
