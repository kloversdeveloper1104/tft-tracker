//! Riot Games API client (account-v1, tft-summoner-v1, tft-league-v1, tft-match-v1)
//! with an async dual-window rate limiter matching development-key limits.

use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};

use reqwest::{StatusCode, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

pub fn region_for_platform(platform: &str) -> &'static str {
    match platform {
        "jp1" | "kr" => "asia",
        "na1" | "br1" | "la1" | "la2" => "americas",
        "euw1" | "eun1" | "tr1" | "ru" | "me1" => "europe",
        "oc1" | "sg2" | "tw2" | "vn2" => "sea",
        _ => "asia",
    }
}

// ---------------------------------------------------------------------------
// Rate limiter: sliding windows for 20 req / 1 s and 100 req / 120 s.
// ---------------------------------------------------------------------------

struct Window {
    limit: usize,
    span: Duration,
    hits: VecDeque<Instant>,
}

impl Window {
    fn new(limit: usize, span: Duration) -> Self {
        Self { limit, span, hits: VecDeque::with_capacity(limit) }
    }
    fn prune(&mut self, now: Instant) {
        while let Some(front) = self.hits.front() {
            if now.duration_since(*front) >= self.span {
                self.hits.pop_front();
            } else {
                break;
            }
        }
    }
    /// Time until a slot frees up (zero if available now).
    fn wait_time(&self, now: Instant) -> Duration {
        if self.hits.len() < self.limit {
            Duration::ZERO
        } else {
            let front = self.hits[0];
            (front + self.span).saturating_duration_since(now) + Duration::from_millis(5)
        }
    }
}

pub struct RateLimiter {
    windows: Mutex<Vec<Window>>,
}

impl RateLimiter {
    pub fn dev_key() -> Self {
        Self {
            windows: Mutex::new(vec![
                Window::new(20, Duration::from_secs(1)),
                Window::new(100, Duration::from_secs(120)),
            ]),
        }
    }

    /// Waits until a request may be sent under every window, then records it.
    pub async fn acquire(&self) {
        loop {
            let wait = {
                let mut ws = self.windows.lock().await;
                let now = Instant::now();
                let mut wait = Duration::ZERO;
                for w in ws.iter_mut() {
                    w.prune(now);
                    wait = wait.max(w.wait_time(now));
                }
                if wait.is_zero() {
                    for w in ws.iter_mut() {
                        w.hits.push_back(now);
                    }
                }
                wait
            };
            if wait.is_zero() {
                return;
            }
            tokio::time::sleep(wait).await;
        }
    }
}

// ---------------------------------------------------------------------------
// Types (Riot JSON is already camelCase for these)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub puuid: String,
    #[serde(default)]
    pub game_name: String,
    #[serde(default)]
    pub tag_line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summoner {
    pub puuid: String,
    #[serde(default)]
    pub profile_icon_id: i64,
    #[serde(default)]
    pub summoner_level: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueEntry {
    #[serde(default)]
    pub queue_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<String>,
    #[serde(default)]
    pub league_points: i64,
    #[serde(default)]
    pub wins: i64,
    #[serde(default)]
    pub losses: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rated_tier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rated_rating: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hot_streak: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub veteran: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fresh_blood: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inactive: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LadderEntry {
    #[serde(default)]
    pub puuid: Option<String>,
    #[serde(default)]
    pub summoner_id: Option<String>,
    #[serde(default)]
    pub league_points: i64,
    #[serde(default)]
    pub wins: i64,
    #[serde(default)]
    pub losses: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueListDto {
    #[serde(default)]
    pub entries: Vec<LadderEntry>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

pub struct RiotClient {
    pub api_key: String,
    pub platform: String,
    pub region: String,
    http: reqwest::Client,
    limiter: Arc<RateLimiter>,
}

/// Tauri-managed state: rebuilt by `configure_riot`.
pub struct RiotState(pub parking_lot::RwLock<Option<Arc<RiotClient>>>);

impl RiotState {
    pub fn client(&self) -> AppResult<Arc<RiotClient>> {
        self.0.read().clone().ok_or(AppError::NotConfigured)
    }
}

const MAX_RETRIES: u32 = 3;

impl RiotClient {
    pub fn new(api_key: String, platform: String) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .user_agent("tft-tracker/1.0")
            .timeout(Duration::from_secs(30))
            .build()?;
        let region = region_for_platform(&platform).to_string();
        Ok(Self { api_key, platform, region, http, limiter: Arc::new(RateLimiter::dev_key()) })
    }

    fn platform_host(&self) -> String {
        format!("https://{}.api.riotgames.com", self.platform)
    }

    fn regional_host(&self) -> String {
        format!("https://{}.api.riotgames.com", self.region)
    }

    async fn get_json<T: DeserializeOwned>(&self, url: Url) -> AppResult<T> {
        let mut attempt = 0u32;
        loop {
            self.limiter.acquire().await;
            let resp = self
                .http
                .get(url.clone())
                .header("X-Riot-Token", &self.api_key)
                .send()
                .await?;
            let status = resp.status();
            if status.is_success() {
                return Ok(resp.json::<T>().await?);
            }
            match status {
                StatusCode::TOO_MANY_REQUESTS => {
                    let retry_after = resp
                        .headers()
                        .get("Retry-After")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.trim().parse::<u64>().ok())
                        .unwrap_or(2);
                    if attempt >= MAX_RETRIES {
                        return Err(AppError::RateLimited { retry_after });
                    }
                    attempt += 1;
                    log::warn!("429 from Riot, retrying in {retry_after}s (attempt {attempt})");
                    tokio::time::sleep(Duration::from_secs(retry_after.max(1))).await;
                }
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                    return Err(AppError::Riot {
                        status: status.as_u16(),
                        message: format!("APIキーが無効か期限切れです ({})", status.as_u16()),
                    });
                }
                StatusCode::NOT_FOUND => {
                    return Err(AppError::NotFound(format!("見つかりませんでした (404): {}", url.path())));
                }
                s if s.is_server_error() && attempt < MAX_RETRIES => {
                    attempt += 1;
                    tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                }
                s => {
                    let body = resp.text().await.unwrap_or_default();
                    let detail = serde_json::from_str::<Value>(&body)
                        .ok()
                        .and_then(|v| v.pointer("/status/message").and_then(|m| m.as_str()).map(String::from))
                        .unwrap_or(body);
                    return Err(AppError::Riot {
                        status: s.as_u16(),
                        message: format!("Riot APIエラー ({}): {}", s.as_u16(), detail.chars().take(200).collect::<String>()),
                    });
                }
            }
        }
    }

    fn url(base: &str, segments: &[&str]) -> AppResult<Url> {
        let mut url = Url::parse(base).map_err(|e| AppError::Http(e.to_string()))?;
        {
            let mut parts = url.path_segments_mut().map_err(|_| AppError::Http("bad base url".into()))?;
            for s in segments {
                parts.push(s);
            }
        }
        Ok(url)
    }

    // ----- account-v1 --------------------------------------------------------

    pub async fn account_by_riot_id(&self, game_name: &str, tag_line: &str) -> AppResult<Account> {
        let url = Self::url(
            &self.regional_host(),
            &["riot", "account", "v1", "accounts", "by-riot-id", game_name.trim(), tag_line.trim().trim_start_matches('#')],
        )?;
        self.get_json(url).await
    }

    // ----- tft-summoner-v1 ---------------------------------------------------

    pub async fn summoner_by_puuid(&self, puuid: &str) -> AppResult<Summoner> {
        let url = Self::url(&self.platform_host(), &["tft", "summoner", "v1", "summoners", "by-puuid", puuid])?;
        self.get_json(url).await
    }

    pub async fn summoner_by_id(&self, summoner_id: &str) -> AppResult<Summoner> {
        let url = Self::url(&self.platform_host(), &["tft", "summoner", "v1", "summoners", summoner_id])?;
        self.get_json(url).await
    }

    // ----- tft-league-v1 -----------------------------------------------------

    pub async fn league_by_puuid(&self, puuid: &str) -> AppResult<Vec<LeagueEntry>> {
        let url = Self::url(&self.platform_host(), &["tft", "league", "v1", "by-puuid", puuid])?;
        self.get_json(url).await
    }

    /// `tier` is one of challenger | grandmaster | master. Entries sorted by LP desc.
    pub async fn ladder(&self, tier: &str) -> AppResult<Vec<LadderEntry>> {
        let tier = tier.to_ascii_lowercase();
        if !matches!(tier.as_str(), "challenger" | "grandmaster" | "master") {
            return Err(AppError::other(format!("unknown ladder tier: {tier}")));
        }
        let mut url = Self::url(&self.platform_host(), &["tft", "league", "v1", &tier])?;
        url.query_pairs_mut().append_pair("queue", "RANKED_TFT");
        let dto: LeagueListDto = self.get_json(url).await?;
        let mut entries = dto.entries;
        entries.sort_by(|a, b| b.league_points.cmp(&a.league_points));
        Ok(entries)
    }

    // ----- tft-match-v1 ------------------------------------------------------

    /// Fetches up to `count` recent match ids (paginates in chunks of 200).
    pub async fn match_ids(&self, puuid: &str, count: usize) -> AppResult<Vec<String>> {
        let mut out: Vec<String> = Vec::new();
        let mut start = 0usize;
        while out.len() < count {
            let chunk = (count - out.len()).min(200);
            let mut url = Self::url(
                &self.regional_host(),
                &["tft", "match", "v1", "matches", "by-puuid", puuid, "ids"],
            )?;
            url.query_pairs_mut()
                .append_pair("start", &start.to_string())
                .append_pair("count", &chunk.to_string());
            let ids: Vec<String> = self.get_json(url).await?;
            let n = ids.len();
            out.extend(ids);
            if n < chunk {
                break;
            }
            start += n;
        }
        Ok(out)
    }

    /// Raw match JSON (stored untouched).
    pub async fn match_by_id(&self, match_id: &str) -> AppResult<Value> {
        let url = Self::url(&self.regional_host(), &["tft", "match", "v1", "matches", match_id])?;
        self.get_json(url).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routing_map() {
        assert_eq!(region_for_platform("jp1"), "asia");
        assert_eq!(region_for_platform("na1"), "americas");
        assert_eq!(region_for_platform("me1"), "europe");
        assert_eq!(region_for_platform("oc1"), "sea");
    }

    #[test]
    fn url_encodes_segments() {
        let u = RiotClient::url("https://asia.api.riotgames.com", &["riot", "account", "v1", "accounts", "by-riot-id", "日本 語", "JP1"]).unwrap();
        assert_eq!(
            u.as_str(),
            "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/%E6%97%A5%E6%9C%AC%20%E8%AA%9E/JP1"
        );
    }
}
