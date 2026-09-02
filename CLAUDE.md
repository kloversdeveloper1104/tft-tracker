# TFT Tracker (Tauri v2 + React 19 + TypeScript + Tailwind v4)

Desktop companion app for Teamfight Tactics. Windows-first. Japanese UI (primary), data from
Riot Games API (needs user API key) and Community Dragon (no key).

## Commands
- `pnpm typecheck` — TypeScript check (must pass)
- `pnpm vite build` — frontend production build (must pass)
- `cd src-tauri && cargo check` — Rust check (must pass)
- `pnpm tauri dev` — run the app (opens window; dev server on :1420)
- `pnpm tauri build` — release bundle (NSIS/MSI in src-tauri/target/release/bundle)

## Layout
- `src/lib/types.ts` — **the contract** shared by frontend + Rust (Rust serializes camelCase).
- `src/lib/api.ts` — typed `invoke` wrappers; command names & arg names are authoritative.
  Tauri v2 converts JS camelCase args to Rust snake_case params automatically.
- `src/lib/utils.ts` (cn, formatters, renderDesc), `src/lib/tft.ts` (trait math, recipes).
- `src/data/odds.ts` — default shop odds, color tokens, queue ids, tier labels.
- `src/stores/` — zustand: `settings` (persisted via tauri-plugin-store `settings.json`),
  `staticData` (CDragon data + lookup maps; `useLookup()`), `toast`.
- `src/components/ui/index.tsx` — primitives: Button, IconButton, Card, Badge, Tabs, Input,
  SearchInput, Select, Switch, Slider, Tooltip, Modal, Skeleton, Spinner, ProgressBar, EmptyState,
  Stat, Kbd, Checkbox, Toaster, PageHeader, Page.
- `src/components/tft/index.tsx` — ChampionIcon, ItemIcon, TraitIcon, AugmentIcon, CostChip,
  PlacementBadge, StarRow, PlacementStrip, RichDesc (+ tooltips).
- `src/app/` — window shell (TitleBar, Sidebar, Layout). `src/App.tsx` — routes (HashRouter).
- `src/features/<feature>/` — one folder per page. `src/features/overlay/OverlayApp.tsx` is the
  root of the separate overlay window (`overlay.html` → `src/overlay-main.tsx`).
- `src-tauri/src/` — Rust: `lib.rs` (builder, plugins, tray), `commands.rs`, `riot.rs` (client +
  rate limiter), `db.rs` (rusqlite), `cdragon.rs` (static data), `stats.rs`, `overlay.rs`.

## Conventions
- Tailwind v4 with theme tokens defined in `src/index.css` (`bg-surface`, `text-fg-muted`,
  `text-gold`, `border-border`, cost colors `cost-1..5`, etc.). Utilities: `card`, `glass`,
  `skeleton`, `focus-ring`, `hex-clip`, `drag-region`, `no-drag`, `text-gradient-gold`.
- Dark theme only. Font: Inter + Noto Sans JP. Numbers use `tabular-nums`.
- UI text in Japanese. Game entity names come from CDragon in the selected locale.
- Every async screen has loading (Skeleton), empty (EmptyState) and error states.
- Icons: `lucide-react`. Charts: `recharts`. Drag & drop: `@dnd-kit/core`.
- Use `toast.*` from `@/stores/toast` for user feedback; never `alert()`.
- Do not use `window.confirm`; use `Modal`.
- Keep shared files (`types.ts`, `api.ts`, `ui/index.tsx`, `tft/index.tsx`) additive-only.

## Data notes
- Champion ids in matches (`character_id`) == `Champion.apiName` (e.g. `DA_18_Xayah`).
- Trait ids in matches (`traits[].name`) == `Trait.apiName`. Champion.traits are display names;
  `Champion.traitApiNames` is the resolved list.
- Item ids == `Item.apiName` (e.g. `TFT_Item_InfinityEdge`). Components list in `tft.ts`.
- Augments may be absent from match data (Riot removed them from the API in newer sets).
- Icon URLs are absolute CDragon PNG URLs already.
- Riot dev keys: 20 req/s, 100 req/2 min, expire every 24h.

## Debugging the WebView without stealing focus (Windows)
Run dev with matching browser args on BOTH windows, then drive the page over CDP (port 9222):
```
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222"
pnpm tauri dev --config src-tauri/tauri.debug.conf.json
```
`overlay.rs` mirrors that env var onto the overlay window; WebView2 refuses (E_INVALIDARG) to create a
second webview in the same user-data folder with different args. Navigate with
`Runtime.evaluate location.hash = "#/route"` and `Page.captureScreenshot`. Window-creating commands
(`open_overlay` etc.) must stay `async fn` — sync commands deadlock window creation on Windows.
