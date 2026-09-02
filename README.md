# TFT Tracker

Teamfight Tactics 向けのデスクトップコンパニオンアプリ(Windows / Tauri v2)。

## 機能

| 機能 | 概要 | データ源 |
| --- | --- | --- |
| ダッシュボード | ランク・LP 推移・直近成績・よく使う構成/ユニット | Riot API |
| 戦績 | 対戦履歴の一覧と 8 人分の詳細(盤面・特性・ダメージ) | Riot API |
| メタ統計 | 上位帯の試合を収集して構成/ユニット/アイテム/特性/オーグメントを集計 | Riot API |
| 図鑑 | チャンピオン・特性・アイテム合成表・オーグメント(日本語) | Community Dragon |
| プランナー | ヘックス盤面に配置して特性を確認、保存・共有コード・オーバーレイ連携 | Community Dragon |
| 確率 & 練習 | ショップ確率表、当たり確率計算(厳密計算)、ロールダウン練習 | 内蔵テーブル |
| オーバーレイ | ゲーム上に常時表示できる小窓(構成チェック・合成表・確率・メモ) | - |

## セットアップ

1. [Riot Developer Portal](https://developer.riotgames.com/) で API キーを取得(開発キーは 24 時間で失効)
2. アプリの「設定」で API キー・地域・Riot ID を登録
3. ダッシュボードの「同期」で戦績を取得

## 開発

```bash
pnpm install
pnpm tauri dev      # 開発起動
pnpm tauri build    # インストーラ生成 (src-tauri/target/release/bundle)
```

必要: Node 20+, pnpm, Rust stable, Visual Studio Build Tools (C++), WebView2。

## 免責

TFT Tracker isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
