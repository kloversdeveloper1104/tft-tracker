//! Aggregation of stored participant rows into `StatsResult`.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::db::{StatsLoad, StatsRow, StatsSource};

// ---------------------------------------------------------------------------
// IPC types (mirror src/lib/types.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsFilter {
    #[serde(default)]
    pub set_number: Option<i64>,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default)]
    pub puuid: Option<String>,
    #[serde(default)]
    pub queue_id: Option<i64>,
    #[serde(default)]
    pub days_back: Option<i64>,
    #[serde(default)]
    pub min_games: Option<i64>,
}

fn default_source() -> String {
    "all".into()
}

impl StatsFilter {
    pub fn source(&self) -> StatsSource {
        match self.source.as_str() {
            "me" => StatsSource::Me,
            "ladder" => StatsSource::Ladder,
            _ => StatsSource::All,
        }
    }
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ItemStat {
    pub name: String,
    pub games: i64,
    pub avg_placement: f64,
    pub top4_rate: f64,
    pub win_rate: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UnitStat {
    pub character_id: String,
    pub games: i64,
    pub pick_rate: f64,
    pub avg_placement: f64,
    pub top4_rate: f64,
    pub win_rate: f64,
    pub avg_stars: f64,
    pub three_star_games: i64,
    pub three_star_avg_placement: f64,
    pub items: Vec<ItemStat>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TraitBucketStat {
    pub num_units: i64,
    pub style: i64,
    pub games: i64,
    pub avg_placement: f64,
    pub top4_rate: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TraitStat {
    pub name: String,
    pub games: i64,
    pub pick_rate: f64,
    pub avg_placement: f64,
    pub buckets: Vec<TraitBucketStat>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AugmentStat {
    pub name: String,
    pub games: i64,
    pub pick_rate: f64,
    pub avg_placement: f64,
    pub top4_rate: f64,
    pub win_rate: f64,
    pub stage: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompUnit {
    pub character_id: String,
    pub frequency: f64,
    pub avg_stars: f64,
    pub top_items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CoreTrait {
    pub name: String,
    pub num_units: i64,
    pub style: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompStat {
    pub key: String,
    pub core_traits: Vec<CoreTrait>,
    pub games: i64,
    pub play_rate: f64,
    pub avg_placement: f64,
    pub top4_rate: f64,
    pub win_rate: f64,
    pub units: Vec<CompUnit>,
    pub avg_level: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatsResult {
    pub games: i64,
    pub matches: i64,
    pub set_number: i64,
    pub units: Vec<UnitStat>,
    pub traits: Vec<TraitStat>,
    pub items: Vec<ItemStat>,
    pub augments: Vec<AugmentStat>,
    pub comps: Vec<CompStat>,
}

// ---------------------------------------------------------------------------
// Accumulators
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Copy)]
struct Acc {
    games: i64,
    placement_sum: i64,
    top4: i64,
    wins: i64,
}

impl Acc {
    fn add(&mut self, placement: i64) {
        self.games += 1;
        self.placement_sum += placement;
        if placement <= 4 {
            self.top4 += 1;
        }
        if placement == 1 {
            self.wins += 1;
        }
    }
    fn avg(&self) -> f64 {
        if self.games == 0 { 0.0 } else { self.placement_sum as f64 / self.games as f64 }
    }
    fn top4_rate(&self) -> f64 {
        if self.games == 0 { 0.0 } else { self.top4 as f64 / self.games as f64 }
    }
    fn win_rate(&self) -> f64 {
        if self.games == 0 { 0.0 } else { self.wins as f64 / self.games as f64 }
    }
}

fn rate(n: i64, total: i64) -> f64 {
    if total == 0 { 0.0 } else { n as f64 / total as f64 }
}

fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

/// Stable cluster key: up to 3 trait names with style >= 2 sorted by
/// (style desc, num_units desc, name asc). Falls back to the single strongest
/// trait by num_units. Empty when the row has no traits.
pub fn comp_key(row: &StatsRow) -> String {
    let mut strong: Vec<&crate::db::StatsTrait> = row.traits.iter().filter(|t| t.style >= 2 && !t.name.is_empty()).collect();
    if strong.is_empty() {
        let best = row
            .traits
            .iter()
            .filter(|t| !t.name.is_empty())
            .max_by(|a, b| a.num_units.cmp(&b.num_units).then_with(|| b.name.cmp(&a.name)));
        return best.map(|t| t.name.clone()).unwrap_or_default();
    }
    strong.sort_by(|a, b| {
        b.style
            .cmp(&a.style)
            .then_with(|| b.num_units.cmp(&a.num_units))
            .then_with(|| a.name.cmp(&b.name))
    });
    strong.iter().take(3).map(|t| t.name.as_str()).collect::<Vec<_>>().join("|")
}

fn median(v: &mut [i64]) -> i64 {
    if v.is_empty() {
        return 0;
    }
    v.sort_unstable();
    v[v.len() / 2]
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------

pub fn compute(load: StatsLoad, min_games: i64) -> StatsResult {
    let rows = &load.rows;
    let total = rows.len() as i64;
    let min_games = min_games.max(1);

    // ----- units + item-on-unit + items overall + traits + augments ------------
    struct UnitAcc {
        acc: Acc,
        stars_sum: i64,
        three: Acc,
        items: HashMap<String, Acc>,
    }
    let mut units: HashMap<String, UnitAcc> = HashMap::new();
    let mut items: HashMap<String, Acc> = HashMap::new();
    struct TraitAcc {
        acc: Acc,
        buckets: BTreeMap<(i64, i64), Acc>,
    }
    let mut traits: HashMap<String, TraitAcc> = HashMap::new();
    struct AugAcc {
        acc: Acc,
        stages: HashMap<i64, i64>,
    }
    let mut augments: HashMap<String, AugAcc> = HashMap::new();

    for row in rows {
        let p = row.placement;

        // Units: one entry per (row, character) — duplicates merged.
        let mut per_char: HashMap<&str, (i64, HashSet<&str>)> = HashMap::new();
        for u in &row.units {
            if u.character_id.is_empty() {
                continue;
            }
            let e = per_char.entry(u.character_id.as_str()).or_insert((0, HashSet::new()));
            e.0 = e.0.max(u.tier);
            for it in &u.item_names {
                if !it.is_empty() {
                    e.1.insert(it.as_str());
                }
            }
        }
        let mut row_items: HashSet<&str> = HashSet::new();
        for (cid, (tier, its)) in per_char {
            let ua = units.entry(cid.to_string()).or_insert_with(|| UnitAcc {
                acc: Acc::default(),
                stars_sum: 0,
                three: Acc::default(),
                items: HashMap::new(),
            });
            ua.acc.add(p);
            ua.stars_sum += tier;
            if tier >= 3 {
                ua.three.add(p);
            }
            for it in its {
                ua.items.entry(it.to_string()).or_default().add(p);
                row_items.insert(it);
            }
        }
        for it in row_items {
            items.entry(it.to_string()).or_default().add(p);
        }

        // Traits (style > 0), one per (row, name).
        let mut seen_traits: HashSet<&str> = HashSet::new();
        for t in &row.traits {
            if t.style <= 0 || t.name.is_empty() || !seen_traits.insert(t.name.as_str()) {
                continue;
            }
            let ta = traits.entry(t.name.clone()).or_insert_with(|| TraitAcc { acc: Acc::default(), buckets: BTreeMap::new() });
            ta.acc.add(p);
            ta.buckets.entry((t.num_units, t.style)).or_default().add(p);
        }

        // Augments with stage = slot index + 1.
        for (idx, a) in row.augments.iter().enumerate() {
            if a.is_empty() {
                continue;
            }
            let aa = augments.entry(a.clone()).or_insert_with(|| AugAcc { acc: Acc::default(), stages: HashMap::new() });
            aa.acc.add(p);
            *aa.stages.entry(idx as i64 + 1).or_default() += 1;
        }
    }

    let mut unit_stats: Vec<UnitStat> = units
        .into_iter()
        .map(|(cid, ua)| {
            let mut its: Vec<(String, Acc)> = ua.items.into_iter().collect();
            its.sort_by(|a, b| b.1.games.cmp(&a.1.games).then_with(|| a.0.cmp(&b.0)));
            UnitStat {
                character_id: cid,
                games: ua.acc.games,
                pick_rate: round3(rate(ua.acc.games, total)),
                avg_placement: round3(ua.acc.avg()),
                top4_rate: round3(ua.acc.top4_rate()),
                win_rate: round3(ua.acc.win_rate()),
                avg_stars: round3(if ua.acc.games == 0 { 0.0 } else { ua.stars_sum as f64 / ua.acc.games as f64 }),
                three_star_games: ua.three.games,
                three_star_avg_placement: round3(ua.three.avg()),
                items: its
                    .into_iter()
                    .take(10)
                    .map(|(name, a)| ItemStat {
                        name,
                        games: a.games,
                        avg_placement: round3(a.avg()),
                        top4_rate: round3(a.top4_rate()),
                        win_rate: round3(a.win_rate()),
                    })
                    .collect(),
            }
        })
        .collect();
    unit_stats.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.character_id.cmp(&b.character_id)));

    let mut item_stats: Vec<ItemStat> = items
        .into_iter()
        .map(|(name, a)| ItemStat {
            name,
            games: a.games,
            avg_placement: round3(a.avg()),
            top4_rate: round3(a.top4_rate()),
            win_rate: round3(a.win_rate()),
        })
        .collect();
    item_stats.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.name.cmp(&b.name)));

    let mut trait_stats: Vec<TraitStat> = traits
        .into_iter()
        .map(|(name, ta)| TraitStat {
            name,
            games: ta.acc.games,
            pick_rate: round3(rate(ta.acc.games, total)),
            avg_placement: round3(ta.acc.avg()),
            buckets: ta
                .buckets
                .into_iter()
                .map(|((num_units, style), a)| TraitBucketStat {
                    num_units,
                    style,
                    games: a.games,
                    avg_placement: round3(a.avg()),
                    top4_rate: round3(a.top4_rate()),
                })
                .collect(),
        })
        .collect();
    trait_stats.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.name.cmp(&b.name)));

    let mut augment_stats: Vec<AugmentStat> = augments
        .into_iter()
        .map(|(name, aa)| {
            let stage = aa.stages.iter().max_by_key(|(s, n)| (**n, -**s)).map(|(s, _)| *s).unwrap_or(0);
            AugmentStat {
                name,
                games: aa.acc.games,
                pick_rate: round3(rate(aa.acc.games, total)),
                avg_placement: round3(aa.acc.avg()),
                top4_rate: round3(aa.acc.top4_rate()),
                win_rate: round3(aa.acc.win_rate()),
                stage,
            }
        })
        .collect();
    augment_stats.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.name.cmp(&b.name)));

    // ----- comps ---------------------------------------------------------------
    struct CompAcc {
        acc: Acc,
        level_sum: i64,
        trait_units: HashMap<String, (Vec<i64>, i64)>, // name -> (numUnits samples, max style)
        units: HashMap<String, (i64, i64, HashMap<String, i64>)>, // cid -> (rows, stars_sum, item counts)
    }
    let mut comps: HashMap<String, CompAcc> = HashMap::new();
    for row in rows {
        let key = comp_key(row);
        if key.is_empty() {
            continue;
        }
        let names: Vec<&str> = key.split('|').collect();
        let ca = comps.entry(key.clone()).or_insert_with(|| CompAcc {
            acc: Acc::default(),
            level_sum: 0,
            trait_units: HashMap::new(),
            units: HashMap::new(),
        });
        ca.acc.add(row.placement);
        ca.level_sum += row.level;
        for t in &row.traits {
            if names.contains(&t.name.as_str()) {
                let e = ca.trait_units.entry(t.name.clone()).or_insert((Vec::new(), 0));
                e.0.push(t.num_units);
                e.1 = e.1.max(t.style);
            }
        }
        let mut per_char: HashMap<&str, (i64, Vec<&str>)> = HashMap::new();
        for u in &row.units {
            if u.character_id.is_empty() {
                continue;
            }
            let e = per_char.entry(u.character_id.as_str()).or_insert((0, Vec::new()));
            e.0 = e.0.max(u.tier);
            e.1.extend(u.item_names.iter().filter(|s| !s.is_empty()).map(String::as_str));
        }
        for (cid, (tier, its)) in per_char {
            let e = ca.units.entry(cid.to_string()).or_insert((0, 0, HashMap::new()));
            e.0 += 1;
            e.1 += tier;
            for it in its {
                *e.2.entry(it.to_string()).or_default() += 1;
            }
        }
    }

    let mut comp_stats: Vec<CompStat> = comps
        .into_iter()
        .filter(|(_, ca)| ca.acc.games >= min_games)
        .map(|(key, ca)| {
            let games = ca.acc.games;
            let mut core_traits: Vec<CoreTrait> = key
                .split('|')
                .map(|name| {
                    let (samples, style) = ca.trait_units.get(name).cloned().unwrap_or((Vec::new(), 0));
                    let mut samples = samples;
                    CoreTrait { name: name.to_string(), num_units: median(&mut samples), style }
                })
                .collect();
            core_traits.sort_by(|a, b| b.style.cmp(&a.style).then_with(|| b.num_units.cmp(&a.num_units)).then_with(|| a.name.cmp(&b.name)));

            let mut units: Vec<CompUnit> = ca
                .units
                .into_iter()
                .map(|(cid, (n, stars, its))| {
                    let mut items: Vec<(String, i64)> = its.into_iter().collect();
                    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
                    CompUnit {
                        character_id: cid,
                        frequency: round3(rate(n, games)),
                        avg_stars: round3(if n == 0 { 0.0 } else { stars as f64 / n as f64 }),
                        top_items: items.into_iter().take(3).map(|(name, _)| name).collect(),
                    }
                })
                .filter(|u| u.frequency >= 0.35)
                .collect();
            units.sort_by(|a, b| b.frequency.partial_cmp(&a.frequency).unwrap_or(std::cmp::Ordering::Equal).then_with(|| a.character_id.cmp(&b.character_id)));
            units.truncate(10);

            CompStat {
                key,
                core_traits,
                games,
                play_rate: round3(rate(games, total)),
                avg_placement: round3(ca.acc.avg()),
                top4_rate: round3(ca.acc.top4_rate()),
                win_rate: round3(ca.acc.win_rate()),
                units,
                avg_level: round3(if games == 0 { 0.0 } else { ca.level_sum as f64 / games as f64 }),
            }
        })
        .collect();
    comp_stats.sort_by(|a, b| b.games.cmp(&a.games).then_with(|| a.key.cmp(&b.key)));

    StatsResult {
        games: total,
        matches: load.matches as i64,
        set_number: load.set_number,
        units: unit_stats,
        traits: trait_stats,
        items: item_stats,
        augments: augment_stats,
        comps: comp_stats,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{StatsTrait, StatsUnit};

    fn t(name: &str, num_units: i64, style: i64) -> StatsTrait {
        StatsTrait { name: name.into(), num_units, style }
    }

    fn row(traits: Vec<StatsTrait>) -> StatsRow {
        StatsRow { placement: 1, level: 8, traits, units: vec![], augments: vec![] }
    }

    #[test]
    fn comp_key_orders_by_style_then_units_then_name() {
        let r = row(vec![t("Zed", 4, 2), t("Alpha", 6, 3), t("Beta", 6, 3), t("Gamma", 2, 1), t("Delta", 8, 4)]);
        assert_eq!(comp_key(&r), "Delta|Alpha|Beta");
    }

    #[test]
    fn comp_key_falls_back_to_largest_trait() {
        let r = row(vec![t("Weak", 2, 1), t("Bigger", 3, 0)]);
        assert_eq!(comp_key(&r), "Bigger");
        assert_eq!(comp_key(&row(vec![])), "");
    }

    #[test]
    fn compute_basic_counts() {
        let mk = |placement: i64| StatsRow {
            placement,
            level: 8,
            traits: vec![t("A", 4, 2), t("B", 2, 1)],
            units: vec![StatsUnit { character_id: "X".into(), item_names: vec!["I1".into(), "I1".into()], tier: 3 }],
            augments: vec!["Aug1".into(), "Aug2".into()],
        };
        let load = StatsLoad { set_number: 15, matches: 1, rows: vec![mk(1), mk(5), mk(3)] };
        let r = compute(load, 1);
        assert_eq!(r.games, 3);
        assert_eq!(r.units[0].games, 3);
        assert_eq!(r.units[0].three_star_games, 3);
        assert_eq!(r.units[0].items[0].games, 3);
        assert_eq!(r.items[0].games, 3);
        assert_eq!(r.traits.len(), 2);
        assert_eq!(r.augments.iter().find(|a| a.name == "Aug2").unwrap().stage, 2);
        assert_eq!(r.comps.len(), 1);
        assert_eq!(r.comps[0].key, "A");
        assert_eq!(r.comps[0].units[0].top_items, vec!["I1".to_string()]);
        assert!((r.comps[0].top4_rate - 0.667).abs() < 1e-9);
    }
}
