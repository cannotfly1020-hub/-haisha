# 少年野球配車管理システム システム設計書 兼 仕様書

> **対象リポジトリ**: `-haisha`（少年野球 配車ヘルパー）  
> **文書の目的**: 本ファイル単体で、データモデル・配車アルゴリズム・UI契約・運用フローを把握し、改修時の仕様衝突・リグレッションを防ぐ。  
> **実装準拠日**: キャッシュバスター `?v=20261025t` 時点のコード実態に一致。

---

## 0. ファイル構成とロード順（変更禁止の契約）

```
/
├── index.html          # シェルUI・モーダル・script/css のクエリ付き読込・SW登録
├── manifest.json       # PWA マニフェスト（name/standalone/icons）
├── sw.js               # Cache First Service Worker（haisha-cache-v…）
├── icons/              # PWA アイコン 192 / 512
├── css/style.css       # レイアウト・タッチ領域・診断カード・2カラム
├── js/data.js          # HaishaData — スキーマ・永続化・リセット・バックアップ
├── js/ui.js            # HaishaUI — 描画・入力ハンドラ
├── js/carpool.js       # HaishaCarpool — 配車・診断・LINE・履歴確定
└── js/app.js           # HaishaApp — イベント委任・起動
```

**PWA キャッシュ**: `sw.js` の `CACHE_NAME`（例: `haisha-cache-v20261025w`）を、`index.html` の `?v=` と**同時に**更新する。旧キャッシュは `activate` で削除される。

**スクリプト依存順（`index.html` 末尾・この順を崩さない）**:

1. `data.js` → `HaishaData`（`cars` / `children` / `saveData` / 正規化）
2. `ui.js` → `HaishaUI`（`renderCars` / `renderChildren` / 編集系）
3. `carpool.js` → `HaishaCarpool`（`generate` / `copyResult` / 診断）
4. `app.js` → `HaishaApp.init()`（リスナ登録＋初回描画）

キャッシュバスター: `css/style.css?v=…` および各 `js/*.js?v=…` を**同時に**上げる。片方だけだと iOS PWA で古い JS/CSS が残る。

---

## 1. システム概要と開発思想

### 1.1 アプリの目的

少年野球チームの**配車係（保護者）**が、毎週の試合・練習に向けて:

1. 出勤車両と選手の出欠・同乗を入力し  
2. 数タップで配車を組み  
3. LINE 用テキストをコピーして保護者連絡に貼る  

ことを、**`manifest.json` + Cache First の Service Worker（`sw.js`）による完全オフライン対応の正規 PWA**として完結させる。

### 1.2 コア原則（改修時に最優先で守る）

| 原則 | 意味 | 破ってはいけない例 |
|------|------|-------------------|
| **ゼロ・ヒューマンエラー志向** | 定員超過を UI／計算で防ぐ。失敗時は診断で次アクションを出す | 定員チェックを外したまま指定車両を許可する |
| **ミニマル LINE 出力** | 共有文面は**名前のみ**の箇条書き。属性ラベル・📌・🤢・「同乗」等を付けない | LINE 文に「保護者」「選手」ラベルや絵文字注記を復活させる |
| **モバイルファースト＆省スペース** | 縦スクロール最小化、インライン操作、アコーディオン／2カラム | 選手カードに常時フル入力フォームを常設して縦に伸ばす |
| **マスタ保護** | 週次リセットは一時フラグのみ。名簿・定員・履歴は消さない | `resetTodaySession` で `rideHistory` や選手名を消す |
| **イベント委任必須** | 動的再描画後もタップが効くこと（特に iOS PWA） | 各ボタンに都度 `addEventListener` だけして親委任を外す |

### 1.3 技術スタック

- Vanilla JS（モジュールバンドラなし）
- **名前空間パターン**（各ファイルは IIFE で閉じ、公開 API のみ専用オブジェクトへ集約）:
  - `window.HaishaData` ← `js/data.js`
  - `window.HaishaUI` ← `js/ui.js`
  - `window.HaishaCarpool` ← `js/carpool.js`
  - `window.HaishaApp` ← `js/app.js`
- 段階的移行のため、主要 API は `window.saveData` 等へエイリアスも残す（新規コードは必ず `Haisha*` 経由）
- **禁止**: グローバル直下への新規 `function` / `var` / `let` / `const` 追加（必ず該当名前空間のプロパティとして追加する）
- `localStorage` 永続化（`cp_cars` / `cp_children`）
- 単一 HTML シェル + CSS + PWA（`manifest.json` / `sw.js`）

---

## 2. データ構造・スキーマ定義（localStorage）

### 2.1 ストレージキー

| キー | 内容 |
|------|------|
| `cp_cars` | 車両配列 JSON |
| `cp_children` | 選手配列 JSON |

セッション UI 状態（永続化しない／`sessionStorage`）:

| キー | 内容 |
|------|------|
| `cp_section_cars` | `"1"` / `"0"` 本日の車パネル開閉 |
| `cp_section_children` | 参加選手パネル開閉 |
| `cp_section_settings` | 設定・バックアップパネル開閉（既定閉じ） |

メモリのみ（永続化しない）:

- `currentAssignments` — 直近の配車結果 `{ [carName]: Child[] }`
- `lastGeneratedPlan` — LINE 用プレーンテキスト
- `openChildCompanionEditors` — 選手カードで同乗入力を開いている ID の `Set`

### 2.2 概念モデル ↔ 実装フィールド対応

仕様書上の概念名と**実装の実フィールド**は次のとおり。**改修は実装フィールド名を正とする。**

| 概念 | 実装 | 備考 |
|------|------|------|
| Player | `children[]` の要素 | |
| Vehicle | `cars[]` の要素 | |
| status | `active` + `meetOnSite` | UI は `getAttendMode` → `'off'\|'ride'\|'site'` |
| parentVehicleId | `parentCar: string` | **車両名**で参照（ID ではない）。改名時は `renameCarCascade` で同期 |
| assignedVehicleId | `fixedCar: string` | 空文字 = 自動。値は**車両名**。改名時はカスケード同期 |
| isCarsick | `motionSick: boolean` | |
| companions | `{ id, label }[]` | **文字列配列ではない** |
| isActive（車） | `active: boolean` | |
| driverName | （独立フィールドなし） | 車両 `name` に含める運用（例: `佐藤号`） |

### 2.3 Companion（同乗者・共通）

```ts
/** 車両側・選手側とも同一形状 */
interface Companion {
  id: string | number;  // newCompanionId() 例: "cmp-1730…-1234"
  label: string;        // 表示名。例: "母", "兄", 自由入力名
}
```

正規化: `normalizeCompanion` — `label` 空は破棄。

### 2.4 Vehicle（車両）— 実装スキーマ

```ts
interface Car {
  id: number;                 // 既存は 1,2,3… / 新規は Date.now()
  name: string;               // 一意運用を前提（親車・指定・履歴キーに使用）
  capacity: number;           // 乗車可能席数（同乗・選手を含む「空き枠」の母数）
  active: boolean;            // 本日出勤
  companions: Companion[];    // 車両側の事前同乗（身内・他家など）
}

// 廃止・移行済み（読み込み時のみ互換）
// familySeats?: number  → companions に「身内」を人数分生成
```

**永続化関数**: `normalizeCar` → `saveData` で `cp_cars`。

**車両改名（参照切れ防止）**:

- UI: 車両カードの名前入力（`data-action="rename-car"`）確定時 → `commitCarRename` → `renameCar(carId, newName)`
- `renameCar`: 空／同一名は中断。他車との名前重複は拒否。成功時 `saveData()`
- `renameCarCascade(car, oldName, newName)` が全選手を走査し自動同期:
  - `parentCar` / `fixedCar` / `lastCar` の `oldName` → `newName`
  - `rideHistory[oldName]` の回数を `rideHistory[newName]` に合算して旧キー削除
  - メモリ上の `currentAssignments` キーも追随
- このため車両を改名しても親車・指定・公平化履歴の参照切れは発生しない

**座席サマリ** `carSeatSummary(car)`:

- `used = companionSeatsOf(car) + fixedSeatsUsed(car.name)`
  - `fixedSeatsUsed` = その車を `fixedCar` に指定している乗車選手の `seatCost` 合計
- `remaining = capacity - used`
- UI バッジ: 残／満席／超過

### 2.5 Player（選手）— 実装スキーマ

```ts
interface Child {
  id: number;
  name: string;
  grade: number;              // 1–6
  pos: string;                // '投手'|'捕手'|'内野'|'外野'|'未定' 等
  parentCar: string;          // 親の車の name。空 = なし
  fixedCar: string;           // 本日の指定車両 name。空 = 自動
  motionSick: boolean;
  active: boolean;            // false = 欠席
  meetOnSite: boolean;        // true かつ active = 現地集合（乗車しない）
  companions: Companion[];    // 選手に付随する同乗者（複数可）
  lastCar: string;            // 直近確定乗車の車両名（公平化）
  rideHistory: {              // 車両名 → 累計乗車回数
    [carName: string]: number;
  };
}

// 廃止・移行済み
// guardianRide?: boolean, guardianName?: string
//   → companions[{ label }] へ migrate（normalizeChildCompanions）
```

**出欠の意味**（`getAttendMode` / `setAttendMode`）:

| UI | active | meetOnSite | 配車上 |
|----|--------|------------|--------|
| 欠席 `off` | false | false | 不参加。同乗・指定クリア |
| 乗車 `ride` | true | false | `isRiding` → 座席消費 |
| 現地 `site` | true | true | `isOnSite` → 座席 0。同乗・指定クリア |

**座席消費** `seatCost(child)`:

```
isRiding(child) ? 1 + child.companions.length : 0
```

### 2.6 AppHistory / Settings

- **履歴**: 選手オブジェクト内の `rideHistory` / `lastCar`（別ストアなし）。
- **履歴の更新タイミング**: 「📋 LINE用テキストをコピー（履歴を確定保存）」=`copyResult()` 時のみ。配車計算だけでは履歴を増やさない。
- **同セッション二重加算防止** (`lastSessionCommit`):
  - 形状: `{ [childId: string]: carName: string }`
  - 保持先: メモリ + `sessionStorage` キー `cp_lastSessionCommit`
  - `copyResult` 時: 既存の `lastSessionCommit` があれば各選手の `rideHistory[直前車両]` を **-1**（0以下はキー削除）してロールバック → 今回の配車で再加算 → 新しいマップを `lastSessionCommit` に保存
  - これにより**同日・同セッション内の複数回コピーでも履歴が積み増しされない**（直前確定の置き換え）
  - `resetTodaySession` / `resetAllData` で `lastSessionCommit` を `null` クリア（翌週は新規1回分として加算）
- **配車モード**: DOM `#carpoolMode`（localStorage 非保存。リロードで標準に戻る）。
  - `balance` | `grade_same` | `grade_diff` | `position`
- **バックアップ JSON**:

```ts
interface BackupPayload {
  version: 1;
  exportedAt: string; // ISO8601
  cars: Car[];
  children: Child[];
}
```

### 2.7 週間リセット vs 完全初期化

| 操作 | 関数 | 消す | 残す |
|------|------|------|------|
| 🔄 本日の配車をリセット | `resetTodaySession` | 出欠を全員乗車、両 companions、fixedCar、車 active=全ON、結果・診断、`lastSessionCommit` | 名前列、grade/pos、parentCar、motionSick、capacity、rideHistory、lastCar |
| データを完全に初期化 | `resetAllData` | `localStorage.clear()`、`lastSessionCommit` クリア後リロード | なし（サンプル再生成） |

---

## 3. 座席計算と配車アルゴリズム（carpool.js）

### 3.1 座席算定ルール（不変）

```
車両の「選手向け空き」概念:
  openForKids ≈ capacity - vehicle.companions.length
  （ただし割り当て中は remainingSeats = capacity - 車同乗 - 既割当選手の seatCost）

選手グループの必要席:
  seatCost = 1 + player.companions.length   // 乗車時のみ
```

**全体成立の事前チェック**:

```
totalCap = Σ active.capacity
familyDemand = Σ companionSeatsOf(active)
kidDemand = Σ seatCost(riding)
seatDemand = kidDemand + familyDemand
if (totalCap < seatDemand) → 失敗（診断表示）
```

UI の状況バーも同様に `kidSeats + companionDemand` vs `activeSeats`。

### 3.2 配車ステップと優先順位（`generateCarpool`）

対象: `activeCars = cars.filter(c => c.active)`、`ridingKids = children.filter(isRiding)`。

#### Step 0 — 前処理失敗

- 乗車も現地もいない → `alert` のみ
- 乗車あり＆出勤車 0 → `presentCarpoolFailure()`（診断）
- 総席不足 → 診断

#### Step 1 — 目標定員の均等配分

- 各車の有効枠 `avail = max(0, capacity - familySeatsOf(car))`
- `kidDemand` を台数で割り、余りを avail の大きい車から配分 → `currentCaps[carName]`（ソフト上限）
- `assignments[carName] = []`

#### Step 2 — 指定車両固定（`fixedCar`）

- 出勤中かつ `remainingSeats >= seatCost` なら配置
- 入らない場合はリストに残し、後で自動配車。該当車名は alert「あふれた分は自動配車に回します」

#### Step 3 — 親の車固定（`parentCar`）

- **本日有効な `fixedCar` がある子はスキップ**（指定が親より優先）
- 親車が出勤中かつ残席足りれば配置

#### Step 4 — 吐き気（`motionSick`）優先

- 未割当の酔い選手を、`currentCaps` または `remainingSeats` で入れる車へ
- ソート: 直近 `lastCar` 同一はペナルティ、残り cap 多い方優先

#### Step 5 — 残余のソート（モード）

| mode | 挙動 |
|------|------|
| `grade_same` | 学年降順 |
| `grade_diff` | 学年降順のあと高↔低を交互 |
| `position` | ポジション名ソート |
| `balance`（他） | シャッフル |

#### Step 6 — 残余割当（スコアリング）

候補車: まず `currentCaps >= cost`、なければ `remainingSeats >= cost`。  
どちらも無ければ **未割当リストへ → 全体失敗（診断）**。

スコア（小さいほど良い）の主要項:

| 項 | 効果 |
|----|------|
| `carPeopleCount < 2` なら **-2000** | **最低2人寄り**を強く優先（ハード制約ではない） |
| `lastCar` 一致 | +500（連続回避） |
| `rideHistory[car] * 15` | 乗り過ぎ回避 |
| モード別 同学年／同ポジ | grade_same は同学年を寄せる、diff/position は分散 |
| 同点 | 人数の少ない車へ |

> **注意（仕様の正確な表現）**: 「孤立乗車禁止」はスコアによる**優先**であり、席が1席しか無い場合などでは1人配置が起きうる。診断側では「1席のみ余る車」を D 提案として警告する。

#### Step 7 — 成功時

- `clearCarpoolDiagnosis()`
- `currentAssignments` セット
- 画面用 `buildScreenPlanText()`（📌・🤢・同乗括弧あり）を `#resultText`
- LINE 用 `buildLinePlanText()` を `lastGeneratedPlan`
- `#resultCard` 表示

#### 履歴確定（`copyResult`・Step 7 の後続）

- LINE テキストをクリップボードへコピーするタイミングで `rideHistory` / `lastCar` を更新する。
- **同セッション内での再コピー時は `lastSessionCommit` による自動ロールバックが走り、同日内の複数回コピーによる履歴二重加算を防止する**（直前分を -1 してから今回分を +1）。
- 週次の「本日の配車をリセット」後は `lastSessionCommit` が空のため、次のコピーは素直に +1 される。

### 3.3 デッドロック診断（`diagnoseCarpoolFailure`）

失敗時 `presentCarpoolFailure` → 結果カード非表示 → `#carpoolDiagnosis` 表示。

**分析値**:

- `kidSeatDemand`, `carCompanionSeats`, `totalCap`, `openSeats`, `shortage`, `totalNeed`
- 任意 `leftoverKids`（Step 6 で置けなかった選手）

**サジェスト（priority 昇順、最大10件、重複除去）**:

| Tag | 内容 |
|-----|------|
| A | 車両同乗の個別解除提案／不足時は選手同乗の削減提案 |
| B | 休止車両の出勤で N 席 |
| C | 席単価の大きい選手から順に現地へ移す必要人数 |
| D | `capacity - 車同乗 === 1` の車への2席以上確保依頼 |
| E | 🤢酔い選手向け空き車なし |

成功時および `resetTodaySession` では診断をクリア。

---

## 4. UI/UX設計とコンポーネント構成

### 4.1 画面ブロック（上から）

1. タイトル  
2. **状況バー**（sticky）— 参加／現地／定員／過不足  
3. 操作バー — 本日リセット／今の状態を保存  
4. **main-grid**  
   - 左（または上）: 本日の車パネル  
   - 右（または下）: 参加選手パネル  
5. 配車ルール + 実行ボタン  
6. **診断カード** `#carpoolDiagnosis`（失敗時のみ）  
7. 配車結果カード（成功時）  
8. 設定・バックアップ（折りたたみ・既定閉じ）  
9. 復元モーダル／選手編集モーダル  

### 4.2 レスポンシブ

- **&lt; 768px**: 1カラム。車・選手はアコーディオン（`toggle-section`）。ヘッダー要約バッジで閉じていても状況把握可。  
- **≥ 768px**: `main-grid` 2カラム。車・選手は常時展開（トグル無効）。設定パネルのみ折りたたみ継続。

### 4.3 車両カード契約

- ヘッダー1行: 出勤チェック + 車名 / 定員残バッジ / 定員編集 / 削除  
- 同乗チップ（あれば）+ クイック `[母][兄][姉][弟][妹]` + 名前入力 + `＋`  
- 満席・休止時は追加 UI `disabled`  
- データアクション: `toggle-car`, `update-capacity`, `add-companion`, `add-companion-custom`, `remove-companion`, `delete-car`

### 4.4 選手カード契約（省スペース）

- 1行目: 出欠セレクト / 名前 / **同乗ピル** / **`＋同乗`**（入力はデフォルト非表示） / 学年・酔い・親・指定バッジ  
- `＋同乗` → `open-child-companion` で入力行展開（`openChildCompanionEditors` で再描画後も維持）  
- 指定車両セレクト（乗車時のみ有効）。定員超過なら alert して拒否（`canFitOnCar`）  
- 編集モーダル: 名前・学年・ポジ・親車・指定・酔い  

**親車と指定の違い**:

- `parentCar` — マスタ。配車 Step 3 のデフォルト固定。週次リセットで消さない。  
- `fixedCar` — 本日の強制指定。リセットで空に戻す。UI 上「指定」。

### 4.5 iOS / PWA タッチ契約（`app.js`）

- `document` へ委任: `click`, `change`, `touchstart`(passive), `touchend`(passive:false), `keydown`(Enter で同乗追加)
- ボタン系は `CLICK_ACTIONS` + `touchend` で実行し、`suppressNextClick` で合成 click の二重実行防止
- `input/select/textarea/label` は touchend アクション対象外（change に任せる）
- CSS: `cursor: pointer`, `touch-action: manipulation`, ボタン最小約 32–44px、`pointer-events` 整理、モーダル非表示時 `pointer-events: none`

**改修時**: 新しいボタンは必ず `data-action` を付け、`CLICK_ACTIONS` と `runClickAction` に登録する。

---

## 5. 外部連携・データ入出力

### 5.1 LINE 出力フォーマット（`buildLinePlanText` / `copyResult`）

**必須フォーマット（壊してはいけない）**:

```
【連絡】本日の配車です🚗
---------------------
■ 佐藤号 (N名)
・ゆうと
・母
・そうた
...

【現地集合】
・はると

---------------------
よろしくお願いいたします！
```

- 各行は `・{名前のみ}`。車両同乗・選手同乗も**ラベル無しで名前だけ**。  
- 画面プレビュー（`buildScreenPlanText`）は 📌 / 🤢 / `（＋同乗）` を付けてよい。**コピーされるのは LINE 用のみ。**

### 5.2 クリップボード

- 共通: `copyTextToClipboard`（Clipboard API → `execCommand` フォールバック）
- 用途: バックアップ JSON、LINE 配車文

### 5.3 バックアップ／復元

- UI: 設定パネル内「退避（コピー）」「退避テキストから復元」
- 復元: モーダル textarea → JSON parse → `cars`/`children` 配列バリデーション → confirm → `normalize*` → `saveData` → 再描画、結果クリア

### 5.4 週次運用フロー（推奨）

1. （任意）前回終了後にバックアップ退避  
2. 「本日の配車をリセット」  
3. 出勤車・出欠・同乗・指定を入力  
4. 配車実行 → 失敗なら診断どおり調整  
5. LINE コピーで履歴確定  
6. 週末終わりに再度退避  

---

## 6. モジュール責務マトリクス（どこを触るか）

### 6.1 名前空間と公開 API

| 名前空間 | ファイル | 主な公開 API |
|----------|----------|--------------|
| `HaishaData` | `js/data.js` | `cars`, `children`, `loadData`, `saveData`, `renameCar`, `renameCarCascade`, `resetTodaySession`, `copyBackupData`, `restoreBackupData`, `seatCost`, `normalize*` |
| `HaishaUI` | `js/ui.js` | `renderCars`, `renderChildren`, `refreshLists`, `openCompanionEditor`, `toggleSection`, 出欠・同乗・CRUD 系 |
| `HaishaCarpool` | `js/carpool.js` | `generate`, `diagnose`, `copyResult`, `buildLinePlanText`, `clearDiagnosis`, `clearLastSessionCommit`, `currentAssignments` |
| `HaishaApp` | `js/app.js` | `init`, `runClickAction`, イベント委任ハンドラ |

**ルール**: 機能追加時は上記いずれかの名前空間オブジェクトにメソッド／プロパティを追加する。グローバル直下への関数追加は禁止（互換エイリアスが必要な場合のみ `global.foo = HaishaX.foo` を明示）。

### 6.2 変更箇所ガイド

| 変更内容 | 主ファイル / 名前空間 | 注意 |
|----------|----------------------|------|
| フィールド追加 | `HaishaData` normalize + `HaishaUI` 描画 + バックアップ互換 | 旧データ migrate を書く |
| 座席定義変更 | `HaishaData.seatCost` / `carSeatSummary` / `HaishaCarpool.diagnose*` | 全箇所を同時更新 |
| 配車優先度 | `HaishaCarpool.generate`（旧 `generateCarpool`） | LINE 形式を変えない |
| ボタン追加 | `HaishaUI` HTML 生成 + `HaishaApp` の `CLICK_ACTIONS` | touchend 対象か確認 |
| 見た目 | `style.css` | タップ領域・768px ルール |
| キャッシュ | `index.html` の `?v=` と `sw.js` の `CACHE_NAME` | 同時更新 |

---

## 7. 回帰させてはいけないチェックリスト

改修後、少なくとも次を手動確認する:

- [ ] 選手同乗 2 名で `seatCost === 3`、親車・指定・自動のすべてで席が減る  
- [ ] 車両同乗チップ削除で残席が戻る  
- [ ] LINE コピー文に 📌・🤢・「同乗」「選手」等が出ない（名前の `・` のみ）  
- [ ] LINE コピー後にだけ `rideHistory` / `lastCar` が増える
- [ ] 同セッションで配車→コピー→組み直し→再コピーしても履歴が二重加算されない（ロールバック後の1回分）
- [ ] 本日リセット後の初回コピーは通常どおり +1 される  
- [ ] 本日リセットで名簿・親車・酔い・定員・履歴が残る  
- [ ] 席不足・出勤車ゼロ・未割当で診断カードが出て、成功時は消える  
- [ ] iPhone PWA で車両クイック同乗・✕・出勤トグルが反応する  
- [ ] 768px 以上で車｜選手の 2 カラム、設定は折りたためる  
- [ ] バックアップ復元で companions 配列が戻る  
- [ ] `?v=` を更新したうえで実機キャッシュを疑う  

---

## 8. 用語集

| 用語 | 意味 |
|------|------|
| 乗車 | `active && !meetOnSite` |
| 現地 | `active && meetOnSite`（配車テキストの末尾リスト） |
| 車両同乗 | `car.companions`（車に紐づく事前枠） |
| 選手同乗 | `child.companions`（選手とセットで席を使う） |
| 親の車 | `parentCar`（マスタ） |
| 指定車両 | `fixedCar`（本日固定、📌は画面のみ） |
| 公平化 | `rideHistory` + `lastCar`（コピー確定時更新） |

---

## 9. 実装上の意図的ギャップ（ドキュメントと理想仕様の差）

将来「理想仕様」へ寄せる際に誤解しないための注記:

1. **車両に `driverName` フィールドは無い** — `name` に含める。  
2. **親車・指定・履歴キーは ID ではなく車両 `name` 文字列** — ただし車両改名時は `renameCar` / `renameCarCascade` により、全選手の `parentCar` / `fixedCar` / `rideHistory` / `lastCar` が自動同期されるため**参照切れは発生しない**。  
3. **companions は `string[]` ではなく `{id,label}[]`**。  
4. **出欠は enum 1 フィールドではなく `active`×`meetOnSite`**。  
5. **最低2人ルールはハード失敗条件ではなくスコアバイアス**。  
6. **PWA**: `manifest.json` と `sw.js`（キャッシュ名 `haisha-cache-v…`、Cache First + Network Fallback）による**完全オフラインキャッシュ対応済み**。加えて localStorage とテキストバックアップでデータ耐障害を確保。アイコンは `icons/icon-192.png` / `icons/icon-512.png`。  
   - `install`: 静的アセットを pre-cache し `skipWaiting()`  
   - `activate`: 旧キャッシュ削除 + `clients.claim()`  
   - `fetch`: 同一オリジン GET をキャッシュ優先、ミス時ネットワーク、ナビ失敗時は `index.html` フォールバック  
   - 登録: `index.html` 末尾で `navigator.serviceWorker.register('./sw.js')`（`load` 後）

---

*本設計書は実装のソース・オブ・トゥルースをコードとし、本ファイルは「人が読む契約書」である。挙動が食い違う場合はコードを正し、続けて本ファイルを更新すること。*
