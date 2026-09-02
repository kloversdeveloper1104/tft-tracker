//! Community Dragon static data: download, cache, and slim into `StaticData`.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};

const CDRAGON_BASE: &str = "https://raw.communitydragon.org/latest";
const CACHE_MAX_AGE_MS: i64 = 24 * 60 * 60 * 1000;

pub const BASE_COMPONENTS: [&str; 10] = [
    "TFT_Item_BFSword",
    "TFT_Item_RecurveBow",
    "TFT_Item_NeedlesslyLargeRod",
    "TFT_Item_TearOfTheGoddess",
    "TFT_Item_ChainVest",
    "TFT_Item_NegatronCloak",
    "TFT_Item_GiantsBelt",
    "TFT_Item_SparringGloves",
    "TFT_Item_Spatula",
    "TFT_Item_FryingPan",
];

// ---------------------------------------------------------------------------
// Output types (mirror src/lib/types.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AbilityVariable {
    pub name: String,
    pub value: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChampionAbility {
    pub name: String,
    pub desc: String,
    pub icon: String,
    pub variables: Vec<AbilityVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChampionStats {
    pub hp: f64,
    pub mana: f64,
    pub initial_mana: f64,
    pub damage: f64,
    pub armor: f64,
    pub magic_resist: f64,
    pub attack_speed: f64,
    pub range: f64,
    pub crit_chance: f64,
    pub crit_multiplier: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Champion {
    pub api_name: String,
    pub character_name: String,
    pub name: String,
    pub cost: i64,
    pub traits: Vec<String>,
    pub trait_api_names: Vec<String>,
    pub icon: String,
    pub square_icon: String,
    pub tile_icon: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub ability: ChampionAbility,
    pub stats: ChampionStats,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TraitEffect {
    pub min_units: i64,
    pub max_units: i64,
    pub style: i64,
    pub variables: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Trait {
    pub api_name: String,
    pub name: String,
    pub desc: String,
    pub icon: String,
    pub effects: Vec<TraitEffect>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub api_name: String,
    pub name: String,
    pub desc: String,
    pub icon: String,
    pub composition: Vec<String>,
    pub effects: Map<String, Value>,
    pub unique: bool,
    pub associated_traits: Vec<String>,
    pub incompatible_traits: Vec<String>,
    pub tags: Vec<String>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Augment {
    pub api_name: String,
    pub name: String,
    pub desc: String,
    pub icon: String,
    pub tier: u8,
    pub associated_traits: Vec<String>,
    pub effects: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StaticData {
    pub set_number: i64,
    pub set_name: String,
    pub mutator: String,
    pub locale: String,
    pub fetched_at: i64,
    pub champions: Vec<Champion>,
    pub traits: Vec<Trait>,
    pub items: Vec<Item>,
    pub augments: Vec<Augment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StaticDataMeta {
    pub available_sets: Vec<i64>,
    pub latest_set: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_at: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn normalize_locale(locale: &str) -> String {
    match locale.to_ascii_lowercase().as_str() {
        "en_us" | "en" => "en_us".to_string(),
        _ => "ja_jp".to_string(),
    }
}

/// Converts a CDragon asset path to an absolute PNG URL.
pub fn icon_url(path: &str) -> String {
    let p = path.trim();
    if p.is_empty() {
        return String::new();
    }
    let mut lower = p.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return lower;
    }
    if let Some(stripped) = lower.strip_suffix(".tex").or_else(|| lower.strip_suffix(".dds")) {
        lower = format!("{stripped}.png");
    }
    let lower = lower.trim_start_matches('/');
    format!("{CDRAGON_BASE}/game/{lower}")
}

fn s(v: Option<&Value>) -> String {
    v.and_then(Value::as_str).unwrap_or("").to_string()
}

fn f(v: Option<&Value>) -> f64 {
    v.and_then(Value::as_f64).unwrap_or(0.0)
}

fn i(v: Option<&Value>) -> i64 {
    v.and_then(|x| x.as_i64().or_else(|| x.as_f64().map(|f| f as i64))).unwrap_or(0)
}

fn str_list(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Keeps numbers as numbers; everything else becomes null (types.ts: number | null).
fn num_map(v: Option<&Value>) -> Map<String, Value> {
    let mut out = Map::new();
    if let Some(obj) = v.and_then(Value::as_object) {
        for (k, val) in obj {
            out.insert(k.clone(), if val.is_number() { val.clone() } else { Value::Null });
        }
    }
    out
}

fn set_number_from_mutator(mutator: &str) -> Option<i64> {
    let rest = mutator.strip_prefix("TFTSet")?;
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    rest.parse().ok()
}

pub fn augment_tier(api_name: &str, icon: &str) -> u8 {
    let icon = icon.to_ascii_lowercase();
    let stem = icon
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim_end_matches(".tex")
        .trim_end_matches(".dds")
        .trim_end_matches(".png");
    for (suffixes, tier) in [
        (["-iii", "_iii", "-3", "_3"], 3u8),
        (["-ii", "_ii", "-2", "_2"], 2u8),
        (["-i", "_i", "-1", "_1"], 1u8),
    ] {
        if suffixes.iter().any(|sfx| stem.ends_with(sfx)) {
            return tier;
        }
    }
    let lower = api_name.to_ascii_lowercase();
    if lower.ends_with("prismatic") || lower.contains("_prismatic") {
        3
    } else if lower.ends_with("plus") || lower.ends_with("gold") {
        2
    } else if lower.ends_with("silver") {
        1
    } else {
        0
    }
}

pub fn classify_item(api_name: &str, composition: &[String], associated_traits: &[String]) -> &'static str {
    if BASE_COMPONENTS.contains(&api_name) {
        return "component";
    }
    let has_spat = composition.iter().any(|c| c == "TFT_Item_Spatula" || c == "TFT_Item_FryingPan");
    if api_name.contains("Emblem") || (!associated_traits.is_empty() && has_spat) {
        return "emblem";
    }
    if api_name.contains("Radiant") {
        return "radiant";
    }
    if api_name.contains("Artifact") || api_name.contains("OrnnItem") {
        return "artifact";
    }
    if api_name.contains("Support") {
        return "support";
    }
    if composition.len() == 2 {
        return "completed";
    }
    if !api_name.starts_with("TFT_Item_") {
        return "special";
    }
    "other"
}

// ---------------------------------------------------------------------------
// Cache paths
// ---------------------------------------------------------------------------

pub struct CdragonCache {
    pub cache_dir: PathBuf,
}

impl CdragonCache {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }

    fn raw_path(&self, locale: &str) -> PathBuf {
        self.cache_dir.join(format!("cdragon_{locale}.json"))
    }
    fn meta_path(&self, locale: &str) -> PathBuf {
        self.cache_dir.join(format!("cdragon_{locale}.json.meta"))
    }
    fn sets_path(&self, locale: &str) -> PathBuf {
        self.cache_dir.join(format!("cdragon_{locale}.sets.json"))
    }
    fn slim_path(&self, locale: &str, set: i64) -> PathBuf {
        self.cache_dir.join(format!("static_{locale}_{set}.json"))
    }

    fn cached_at(&self, locale: &str) -> Option<i64> {
        let ts = std::fs::read_to_string(self.meta_path(locale)).ok()?;
        ts.trim().parse::<i64>().ok().filter(|_| self.raw_path(locale).exists())
    }

    /// Any locale that has a raw cache (prefers ja_jp).
    fn any_cached_locale(&self) -> Option<String> {
        ["ja_jp", "en_us"].iter().find(|l| self.cached_at(l).is_some()).map(|l| l.to_string())
    }

    pub async fn download(&self, locale: &str) -> AppResult<i64> {
        std::fs::create_dir_all(&self.cache_dir)?;
        let url = format!("{CDRAGON_BASE}/cdragon/tft/{locale}.json");
        log::info!("downloading {url}");
        let client = reqwest::Client::builder().user_agent("tft-tracker/1.0").build()?;
        let resp = client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Http(format!("CDragon の取得に失敗しました ({})", resp.status().as_u16())));
        }
        let bytes = resp.bytes().await?;
        // Validate before replacing the old cache.
        let parsed: Value = serde_json::from_slice(&bytes)?;
        let sets = available_sets(&parsed);
        let tmp = self.raw_path(locale).with_extension("json.tmp");
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, self.raw_path(locale))?;
        let ts = now_ms();
        std::fs::write(self.meta_path(locale), ts.to_string())?;
        std::fs::write(self.sets_path(locale), serde_json::to_string(&sets)?)?;
        // Drop stale slimmed caches for this locale.
        if let Ok(rd) = std::fs::read_dir(&self.cache_dir) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with(&format!("static_{locale}_")) {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
        Ok(ts)
    }

    /// Ensures a usable raw cache. Downloads when missing; when older than 24h
    /// a re-download is attempted but the stale cache is kept if it fails.
    pub async fn ensure_raw(&self, locale: &str) -> AppResult<i64> {
        match self.cached_at(locale) {
            Some(ts) if now_ms() - ts <= CACHE_MAX_AGE_MS => Ok(ts),
            Some(ts) => match self.download(locale).await {
                Ok(fresh) => Ok(fresh),
                Err(e) => {
                    log::warn!("CDragon refresh failed, using stale cache: {e}");
                    Ok(ts)
                }
            },
            None => self.download(locale).await,
        }
    }

    fn read_raw(&self, locale: &str) -> AppResult<Value> {
        let bytes = std::fs::read(self.raw_path(locale))?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    fn read_sets(&self, locale: &str) -> AppResult<Vec<i64>> {
        if let Ok(txt) = std::fs::read_to_string(self.sets_path(locale)) {
            if let Ok(v) = serde_json::from_str::<Vec<i64>>(&txt) {
                if !v.is_empty() {
                    return Ok(v);
                }
            }
        }
        let raw = self.read_raw(locale)?;
        let sets = available_sets(&raw);
        let _ = std::fs::write(self.sets_path(locale), serde_json::to_string(&sets)?);
        Ok(sets)
    }

    /// Meta for whichever locale is cached; downloads `en_us` when nothing is cached.
    pub async fn meta(&self, locale: Option<&str>) -> AppResult<StaticDataMeta> {
        let locale = match locale.map(normalize_locale) {
            Some(l) => l,
            None => self.any_cached_locale().unwrap_or_else(|| "ja_jp".to_string()),
        };
        let cached_at = self.ensure_raw(&locale).await?;
        let sets_path_owner = self.cache_dir.clone();
        let loc = locale.clone();
        let sets = tauri::async_runtime::spawn_blocking(move || CdragonCache::new(sets_path_owner).read_sets(&loc)).await??;
        let latest = sets.iter().copied().max().unwrap_or(0);
        Ok(StaticDataMeta { available_sets: sets, latest_set: latest, cached_at: Some(cached_at) })
    }

    pub async fn static_data(&self, locale: &str, set_number: Option<i64>) -> AppResult<StaticData> {
        let locale = normalize_locale(locale);
        let cached_at = self.ensure_raw(&locale).await?;
        let cache_dir = self.cache_dir.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let cache = CdragonCache::new(cache_dir);
            let set = match set_number {
                Some(s) => s,
                None => cache.read_sets(&locale)?.into_iter().max().unwrap_or(0),
            };
            // Serve the slimmed cache when it is at least as fresh as the raw download.
            let slim = cache.slim_path(&locale, set);
            if let Ok(txt) = std::fs::read_to_string(&slim) {
                if let Ok(data) = serde_json::from_str::<StaticData>(&txt) {
                    if data.fetched_at >= cached_at && !data.champions.is_empty() {
                        return Ok(data);
                    }
                }
            }
            let raw = cache.read_raw(&locale)?;
            let mut data = slim_set(&raw, set, &locale)?;
            data.fetched_at = cached_at;
            if let Ok(txt) = serde_json::to_string(&data) {
                let _ = std::fs::write(&slim, txt);
            }
            Ok(data)
        })
        .await?
    }

    pub async fn refresh(&self, locale: &str) -> AppResult<StaticDataMeta> {
        let locale = normalize_locale(locale);
        self.download(&locale).await?;
        self.meta(Some(&locale)).await
    }
}

// ---------------------------------------------------------------------------
// Slimming
// ---------------------------------------------------------------------------

pub fn available_sets(raw: &Value) -> Vec<i64> {
    let mut sets: Vec<i64> = raw
        .get("setData")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|sd| sd.get("mutator").and_then(Value::as_str).and_then(set_number_from_mutator))
                .collect()
        })
        .unwrap_or_default();
    if sets.is_empty() {
        if let Some(obj) = raw.get("sets").and_then(Value::as_object) {
            sets = obj.keys().filter_map(|k| k.parse::<i64>().ok()).collect();
        }
    }
    sets.sort_unstable();
    sets.dedup();
    sets
}

fn find_set_entry(raw: &Value, set: i64) -> Option<&Value> {
    let mutator = format!("TFTSet{set}");
    raw.get("setData")
        .and_then(Value::as_array)?
        .iter()
        .filter(|sd| sd.get("mutator").and_then(Value::as_str) == Some(mutator.as_str()))
        .max_by_key(|sd| sd.get("champions").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0))
}

fn parse_trait(t: &Value) -> Trait {
    let effects = t
        .get("effects")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|e| TraitEffect {
                    min_units: i(e.get("minUnits")),
                    max_units: i(e.get("maxUnits")),
                    style: i(e.get("style")),
                    variables: num_map(e.get("variables")),
                })
                .collect()
        })
        .unwrap_or_default();
    Trait {
        api_name: s(t.get("apiName")),
        name: s(t.get("name")),
        desc: s(t.get("desc")),
        icon: icon_url(&s(t.get("icon"))),
        effects,
    }
}

fn parse_champion(c: &Value, trait_by_name: &HashMap<String, String>) -> Champion {
    let traits = str_list(c.get("traits"));
    let trait_api_names = traits.iter().filter_map(|n| trait_by_name.get(n).cloned()).collect();
    let ab = c.get("ability");
    let variables = ab
        .and_then(|a| a.get("variables"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|v| AbilityVariable {
                    name: s(v.get("name")),
                    value: v
                        .get("value")
                        .and_then(Value::as_array)
                        .map(|vals| vals.iter().map(|x| x.as_f64().unwrap_or(0.0)).collect())
                        .unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();
    let st = c.get("stats");
    Champion {
        api_name: s(c.get("apiName")),
        character_name: s(c.get("characterName")),
        name: s(c.get("name")),
        cost: i(c.get("cost")),
        traits,
        trait_api_names,
        icon: icon_url(&s(c.get("icon"))),
        square_icon: icon_url(&s(c.get("squareIcon"))),
        tile_icon: icon_url(&s(c.get("tileIcon"))),
        role: c.get("role").and_then(Value::as_str).filter(|r| !r.is_empty()).map(String::from),
        ability: ChampionAbility {
            name: s(ab.and_then(|a| a.get("name"))),
            desc: s(ab.and_then(|a| a.get("desc"))),
            icon: icon_url(&s(ab.and_then(|a| a.get("icon")))),
            variables,
        },
        stats: ChampionStats {
            hp: f(st.and_then(|x| x.get("hp"))),
            mana: f(st.and_then(|x| x.get("mana"))),
            initial_mana: f(st.and_then(|x| x.get("initialMana"))),
            damage: f(st.and_then(|x| x.get("damage"))),
            armor: f(st.and_then(|x| x.get("armor"))),
            magic_resist: f(st.and_then(|x| x.get("magicResist"))),
            attack_speed: f(st.and_then(|x| x.get("attackSpeed"))),
            range: f(st.and_then(|x| x.get("range"))),
            crit_chance: f(st.and_then(|x| x.get("critChance"))),
            crit_multiplier: f(st.and_then(|x| x.get("critMultiplier"))),
        },
    }
}

fn is_augment_entry(v: &Value) -> bool {
    v.get("isAugment").and_then(Value::as_bool).unwrap_or(false)
        || s(v.get("apiName")).contains("Augment")
}

pub fn slim_set(raw: &Value, set: i64, locale: &str) -> AppResult<StaticData> {
    let entry = find_set_entry(raw, set);
    let fallback = raw.get("sets").and_then(|x| x.get(set.to_string()));
    let src = entry.or(fallback).ok_or_else(|| AppError::NotFound(format!("セット {set} のデータがありません")))?;

    // Traits
    let traits: Vec<Trait> = src
        .get("traits")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().map(parse_trait).filter(|t| !t.api_name.is_empty()).collect())
        .unwrap_or_default();
    let trait_by_name: HashMap<String, String> = traits.iter().map(|t| (t.name.clone(), t.api_name.clone())).collect();

    // Champions (only those with traits)
    let mut champions: Vec<Champion> = src
        .get("champions")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter(|c| c.get("traits").and_then(Value::as_array).map(|t| !t.is_empty()).unwrap_or(false))
                .map(|c| parse_champion(c, &trait_by_name))
                .filter(|c| !c.api_name.is_empty())
                .collect()
        })
        .unwrap_or_default();
    {
        let mut seen = HashSet::new();
        champions.retain(|c| seen.insert(c.api_name.clone()));
        champions.sort_by(|a, b| a.cost.cmp(&b.cost).then_with(|| a.name.cmp(&b.name)));
    }

    // Item index: apiName -> first entry with a non-empty name.
    let all_items = raw.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut item_index: HashMap<String, &Value> = HashMap::new();
    for it in &all_items {
        let api = s(it.get("apiName"));
        if api.is_empty() {
            continue;
        }
        let has_name = !s(it.get("name")).is_empty();
        match item_index.get(&api) {
            Some(existing) if !s(existing.get("name")).is_empty() => {}
            _ => {
                if has_name || !item_index.contains_key(&api) {
                    item_index.insert(api, it);
                }
            }
        }
    }

    let set_item_names: Vec<String> = entry.map(|e| str_list(e.get("items"))).unwrap_or_default();
    let set_item_set: HashSet<&str> = set_item_names.iter().map(String::as_str).collect();
    let set_augment_names: Vec<String> = entry.map(|e| str_list(e.get("augments"))).unwrap_or_default();
    let set_augment_set: HashSet<&str> = set_augment_names.iter().map(String::as_str).collect();

    // Items: (a) TFT_Item_* in the set list or base components, (b) every set-list name that is not an augment.
    let mut wanted: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for api in item_index.keys() {
        if api.starts_with("TFT_Item_") && (set_item_set.contains(api.as_str()) || BASE_COMPONENTS.contains(&api.as_str())) {
            if seen.insert(api.clone()) {
                wanted.push(api.clone());
            }
        }
    }
    for api in &set_item_names {
        if set_augment_set.contains(api.as_str()) || api.contains("Augment") {
            continue;
        }
        if seen.insert(api.clone()) {
            wanted.push(api.clone());
        }
    }
    let mut items: Vec<Item> = Vec::new();
    for api in wanted {
        let Some(v) = item_index.get(&api) else { continue };
        if v.get("isAugment").and_then(Value::as_bool).unwrap_or(false) {
            continue;
        }
        let name = s(v.get("name"));
        if name.is_empty() {
            continue;
        }
        let composition = str_list(v.get("composition"));
        let associated_traits = str_list(v.get("associatedTraits"));
        let kind = classify_item(&api, &composition, &associated_traits);
        items.push(Item {
            api_name: api.clone(),
            name,
            desc: s(v.get("desc")),
            icon: icon_url(&s(v.get("icon"))),
            composition,
            effects: num_map(v.get("effects")),
            unique: v.get("unique").and_then(Value::as_bool).unwrap_or(false),
            associated_traits,
            incompatible_traits: str_list(v.get("incompatibleTraits")),
            tags: str_list(v.get("tags")),
            kind: kind.to_string(),
        });
    }
    items.sort_by(|a, b| a.api_name.cmp(&b.api_name));

    // Augments
    let mut augments: Vec<Augment> = Vec::new();
    let mut seen_aug: HashSet<&str> = HashSet::new();
    for api in &set_augment_names {
        if !seen_aug.insert(api.as_str()) {
            continue;
        }
        let Some(v) = item_index.get(api) else { continue };
        let name = s(v.get("name"));
        if name.is_empty() {
            continue;
        }
        let icon_raw = s(v.get("icon"));
        augments.push(Augment {
            api_name: api.clone(),
            name,
            desc: s(v.get("desc")),
            icon: icon_url(&icon_raw),
            tier: augment_tier(api, &icon_raw),
            associated_traits: str_list(v.get("associatedTraits")),
            effects: num_map(v.get("effects")),
        });
    }
    // Fallback: if the set entry lists no augments, take augment-like items whose name is non-empty.
    if augments.is_empty() && entry.is_none() {
        for (api, v) in &item_index {
            if is_augment_entry(v) && api.contains(&format!("TFT{set}_")) {
                let name = s(v.get("name"));
                if name.is_empty() {
                    continue;
                }
                let icon_raw = s(v.get("icon"));
                augments.push(Augment {
                    api_name: api.clone(),
                    name,
                    desc: s(v.get("desc")),
                    icon: icon_url(&icon_raw),
                    tier: augment_tier(api, &icon_raw),
                    associated_traits: str_list(v.get("associatedTraits")),
                    effects: num_map(v.get("effects")),
                });
            }
        }
    }
    // Dedupe augments that share a display name (old-set variants re-listed in the current set):
    // prefer the entry whose apiName looks set-specific (contains the set number or no TFT<n>_ prefix).
    {
        let score = |api: &str| -> i32 {
            let mut sc = 0;
            if api.contains(&format!("{set}_")) || api.contains(&format!("Set{set}")) { sc += 4; }
            if !api.starts_with("TFT") { sc += 2; }
            if api.ends_with("PlusPlus") { sc -= 1; }
            sc
        };
        let mut best: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for (i, a) in augments.iter().enumerate() {
            match best.get(&a.name) {
                Some(&j) if score(&augments[j].api_name) >= score(&a.api_name) => {}
                _ => { best.insert(a.name.clone(), i); }
            }
        }
        let keep: HashSet<usize> = best.values().copied().collect();
        let mut i = 0;
        augments.retain(|_| { let k = keep.contains(&i); i += 1; k });
    }
    augments.sort_by(|a, b| b.tier.cmp(&a.tier).then_with(|| a.name.cmp(&b.name)));

    // CDragon set names are often placeholders like "Set10"; hide those.
    let raw_set_name = s(src.get("name"));
    let set_name = if raw_set_name.trim_start_matches("Set").chars().all(|c| c.is_ascii_digit()) {
        String::new()
    } else {
        raw_set_name
    };

    Ok(StaticData {
        set_number: set,
        set_name,
        mutator: entry.map(|e| s(e.get("mutator"))).unwrap_or_else(|| format!("TFTSet{set}")),
        locale: locale.to_string(),
        fetched_at: now_ms(),
        champions,
        traits,
        items,
        augments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icon_url_conversion() {
        assert_eq!(
            icon_url("ASSETS/Characters/TFT15_Ahri/HUD/TFT15_Ahri_Square.TFT_Set15.tex"),
            "https://raw.communitydragon.org/latest/game/assets/characters/tft15_ahri/hud/tft15_ahri_square.tft_set15.png"
        );
        assert_eq!(
            icon_url("ASSETS/Maps/Particles/TFT/Item_Icons/Standard/Spatula.dds"),
            "https://raw.communitydragon.org/latest/game/assets/maps/particles/tft/item_icons/standard/spatula.png"
        );
        assert_eq!(icon_url(""), "");
        assert_eq!(icon_url("https://example.com/X.png"), "https://example.com/x.png");
    }

    #[test]
    fn augment_tier_from_icon() {
        assert_eq!(augment_tier("TFT9_Augment_Foo", "ASSETS/.../Foo-III.tex"), 3);
        assert_eq!(augment_tier("TFT9_Augment_Foo", "ASSETS/.../Foo_ii.tex"), 2);
        assert_eq!(augment_tier("TFT9_Augment_Foo", "ASSETS/.../Foo-I.tex"), 1);
        assert_eq!(augment_tier("TFT9_Augment_FooPlus", "ASSETS/.../Foo.tex"), 2);
        assert_eq!(augment_tier("TFT9_Augment_Foo", "ASSETS/.../Foo.tex"), 0);
    }

    #[test]
    fn item_kinds() {
        assert_eq!(classify_item("TFT_Item_BFSword", &[], &[]), "component");
        assert_eq!(
            classify_item("TFT_Item_InfinityEdge", &["TFT_Item_BFSword".into(), "TFT_Item_SparringGloves".into()], &[]),
            "completed"
        );
        assert_eq!(classify_item("TFT15_Item_XEmblemItem", &[], &[]), "emblem");
        assert_eq!(classify_item("TFT_Item_Artifact_Foo", &[], &[]), "artifact");
        assert_eq!(classify_item("TFT5_Item_InfinityEdgeRadiant", &[], &[]), "radiant");
        assert_eq!(classify_item("TFT_Item_SupportBanshees", &[], &[]), "support");
        assert_eq!(classify_item("TFT9_Consumable_Foo", &[], &[]), "special");
        assert_eq!(classify_item("TFT_Item_Unknown", &[], &[]), "other");
    }

    #[test]
    fn set_numbers() {
        assert_eq!(set_number_from_mutator("TFTSet15"), Some(15));
        assert_eq!(set_number_from_mutator("TFTSet15_Act2"), None);
        assert_eq!(set_number_from_mutator("TFTTutorial"), None);
    }
}
