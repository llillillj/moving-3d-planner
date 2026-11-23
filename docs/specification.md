# Moving 3D Planner 実装仕様書

引っ越し検討者向けの 3D/2D 家具配置・物件比較シミュレーター **Moving 3D Planner（間取り3Dプランナー）** の要件・アーキテクチャ仕様です。

---

## 1. 設計方針・座標系

### 基本方針
- **UI・応答言語**: 日本語に統一。
- **最優先する体験**: 物理干渉チェックや通路幅警告は意図的に設けず、**配置のしやすさ**と**サイズ感の視覚確認（俯瞰・真上・一人称）**を最優先する。
- **クライアント完結型**: ユーザーデータはすべてブラウザ内 IndexedDB に保存し、サーバー永続化は行わない。

### 座標系と単位
| 項目 | 仕様 |
| --- | --- |
| 3D 空間・内部データ | `1単位 = 1m`、右手系（Y 軸 = 高さ、XZ 平面 = 床面） |
| 家具・固定設備の原点 | 底面中央 `(centerX, bottomY, centerZ)` |
| UI 入力・表示 | `cm` / `度` に統一（`src/lib/units.ts` で内部値 `m` / ラジアンと相互変換） |

---

## 2. 技術スタック・ディレクトリ構成

- **Frontend**: Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS v4
- **3D 描画**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **状態管理・永続化**: Zustand (`src/store/usePlannerStore.ts`), Dexie (IndexedDB), JSON 入出力
- **AI 解析**: `@google/genai`（サーバー側 Route Handler で実行。モデル: `process.env.GEMINI_MODEL || "gemini-2.5-flash"`）

```text
src/
├── app/
│   ├── page.tsx                             # エントリページ
│   └── api/
│       ├── analyze-floorplan/route.ts       # 間取り図 AI 解析 API
│       ├── analyze-furniture/route.ts       # 家具写真 AI 解析・3D 構築 API
│       └── reconstruct-furniture/route.ts   # 家具 3D パーツ再構築専用 API
├── components/
│   ├── layout/                              # PlannerWorkspace, HeaderBar, LeftSidebar, InspectorPanel, DataTransferModal
│   ├── viewport3d/                          # RoomCanvas3D, RoomStructure3D, CameraController, FixedFixtureMesh, PlacedFurnitureItem
│   │   └── models/                          # FurnitureModelRenderer, ProceduralFurnitureMesh, CustomProceduralFurnitureMesh, GlbFurnitureMesh
│   ├── editor2d/                            # FloorplanEditor2D, FloorplanUploadModal, ScaleCalibrationModal
│   └── furniture/                           # FurnitureRegisterModal, FurniturePreview3D
├── services/furniture/                      # FurnitureGenerationProvider（provider, procedural-provider, glb-provider）
├── store/usePlannerStore.ts                 # Zustand ストア＋IndexedDB 非同期保存
├── lib/                                     # db, seed-data, geometry, units, image-utils, floorplan-converter, furniture-custom-model, storage-io, gemini
└── types/planner.ts                         # ドメインモデル・API 型定義
```

---

## 3. データモデル（データ分離設計）

物件比較を容易にするため、**マイ家具カタログ**と**物件データ**を分離します（型定義: `src/types/planner.ts`）。

### 3.1 マイ家具カタログ（全物件共通）
- **`FurnitureAsset`**: `id`, `name`, `category`（10種）, `dimensions` (m), `model`, `thumbnailDataUrl?`, `memo?`。
- **`FurnitureModelSpec`**（プロシージャルと GLB を透過的に扱う判別共用体）:
  ```ts
  type FurnitureModelSpec =
    | {
        kind: 'procedural';
        shapeType: ProceduralShapeType; // 'custom' または定型 12 種
        color: string;
        partsHint?: string[];
        customModel?: CustomProceduralModel;
      }
    | { kind: 'glb'; url: string; normalizeScale: boolean };
  ```
- **`CustomProceduralModel`**: AI が写真から生成するパーツ設計図（`designDimensionsCm`, `parts[]`, `structureSummaryJa?`）。
  - 座標系: 設計空間 `cm`（底面中央 `[0, 0, 0]`・上 `+Y`・正面 `+Z`）。
  - パーツ要素: 8 種プリミティブ（`box`, `rounded_box`, `cylinder`, `sphere`, `capsule`, `cone`, `torus`, `arch`）× 10 種質感（`wood`, `fabric`, `leather`, `metal`, `glass`, `mirror`, `plastic`, `ceramic`, `matte`, `emissive`）。
  - サーバー側サニタイザ（`furniture-custom-model.ts`）で座標・寸法・色・角度・パーツ数（上限 64）を正規化。

### 3.2 物件データ（`Property`）
| フィールド | 役割 |
| --- | --- |
| `floorplanImage` / `scaleCalibration` | 2D 背景の間取り図（Data URL・`metersPerPixel`・透過度・ON/OFF）と基準 2 点の縮尺補正履歴 |
| `vertices` / `walls` | 頂点共有グラフ構造の壁（外壁・間仕切り・腰壁）と建具（`door`, `sliding_door`, `window`, `opening`） |
| `zones` | 床の色分け・ラベル表示用の任意ポリゴン |
| `fixtures` (`FixedFixture[]`) | 備え付け固定設備（9種: キッチン・浴槽・トイレ・洗面台・洗濯機パン・収納・シューズボックス・エアコン・その他）。AI／プリセット由来は初期 `locked: true` |
| `layouts` (`LayoutVariant[]`) | 同一物件内の複数配置案。各 `PlacedFurniture` は `assetId` 参照・位置・Y 回転・個別寸法上書き (`dimensionsOverride`)・ロックを保持 |

### 3.3 永続化対象外の UI 状態
エディタ表示モード（`3d` / `2d` / `split`）、カメラ視点（`perspective` / `top` / `first_person`）、天井・グリッド表示、スナップ設定、選択状態、ドラッグ状態はメモリ上のみで管理します。

---

## 4. 機能要件

### 4.1 物件・配置案管理（`HeaderBar`）
- 物件の切替・新規作成（基本 5m×4m 部屋）・複製・改名・削除（最低 1 件維持）・初期化リセット。
- 同一物件内での配置案（`LayoutVariant`）の切替・複製・空案追加・改名・削除（最低 1 案維持）。

### 4.2 マイ家具カタログ・登録／編集（`LeftSidebar` / `FurnitureRegisterModal`）
- **サイドバー**: 家具名・カテゴリ・メモ検索、カテゴリ絞り込み、サムネイル／モデル種別バッジ（`AI再現` / `GLB`）、ワンクリック配置、編集・削除。配置済・設備タブでは配置家具の撤去、固定設備のロック切替・手動追加（9種）を実行可能。
- **登録・編集モーダル**:
  - **写真から AI 登録・3D 構築**: 「画像から 3D 構築（AI 再現）」（既定）または「定型テンプレート判定（12種）」を選択。採寸ヒント・AI 目安値適用・定番サイズプリセット（ベッド・ソファ・テーブル・デスク）を使い実寸（`cm`）を入力。
  - **切替・再構築・微調整**: 解析後いつでも「AI 画像再現」⇔「定型テンプレート」を切替可能。実寸入力後や自然言語ヒントを添えた **AI 再構築**、パーツ別カラーピッカー調整に対応。
  - **手動入力 / GLB / 既存家具編集**: 「AI 再現 / 定型 3D / GLB」の 3 モード切替、既存家具への写真追加・AI 3D 化、登録時の即時配置オプションを提供。

### 4.3 3D 配置ビュー ＆ インスペクタ（`RoomCanvas3D` / `InspectorPanel`）
- **3 視点（`CameraController`）**: `perspective`（斜め俯瞰）、`top`（真上 2D 風）、`first_person`（目線高さ `1.55m`・左ドラッグ見渡し＋WASD / 矢印キー移動）。
- **操作・ショートカット**: 床面ドラッグ移動、青ノブ回転、`5cm` / `90°` スナップ（`Shift` で一時解除）、`R` / `Shift+R`（90° 回転）、`Delete` / `Backspace`（削除）、`Esc`（選択解除）、天井・グリッド切替、外寸・天井高の常時表示。
- **インスペクタ**: 家具・固定設備・壁・頂点・物件情報（メモ・標準天井高）を `cm` / `度` で数値編集。家具選択時はモデル種別・サムネイル・AI 構造サマリー表示、ロック・複製・撤去・個別寸法上書きに対応。

### 4.4 2D 間取りエディタ（`FloorplanEditor2D`）
- **表示モード**: `3D 家具配置` / `2D 間取り編集` / `2D+3D 同時`（リアルタイム同期）。
- **4 ツール**: `select`（頂点移動・近接結合・ロック解除済み設備の移動/四隅リサイズ）、`draw_wall`（スナップ付き連続作図）、`split_wall`（壁分割）、`calibrate`（任意 2 点または選択壁の実寸 `cm` 入力による全体比例スケーリング）。
- **表示補助**: 背景間取り図の ON/OFF・透過度調整、配置済み家具の 2D オーバーレイ。

### 4.5 AI 解析・3D 構築 API（Gemini 構造化出力）
ブラウザ側（`image-utils.ts`）で事前リサイズ・白背景合成した Data URL を送信し、`responseMimeType: "application/json"` + `responseSchema` で抽出します。

| エンドポイント | 主な入力（画像上限） | 出力・後処理 |
| --- | --- | --- |
| `POST /api/analyze-floorplan` | 間取り図（長辺 `1600px`） | 正規化座標 (`0〜1000`) で頂点・壁・建具・固定設備・推定横幅 (m) を抽出。`floorplan-converter.ts` でワールド座標変換、8cm 以内頂点自動結合、設備は `locked: true` で登録（画像のみ背景敷きも可） |
| `POST /api/analyze-furniture` | 家具写真（解析 `1024px` / サムネ `320px`）＋ `mode`（`'reconstruct'` 既定 / `'template'`） | 名称・カテゴリ・代表色・定型 12 種・特徴ヒント・目安寸法・採寸ヒントを抽出。`'reconstruct'` 時は `customModel` も同時生成しサニタイズ |
| `POST /api/reconstruct-furniture` | 家具写真 ＋ 任意の名称・カテゴリ・実寸 (`dimensionsCm`)・微調整ヒント (`userHint`) | 写真固有の構造を 8〜36 個程度（上限 64）のプリミティブパーツへ分解し `CustomProceduralModel` を構築・再構築 |

### 4.6 将来の GLB 移行アーキテクチャ
外部 Image-to-3D API（`.glb`）へ最小変更で移行できるよう 2 層を抽象化しています。

1. **描画統一（`<FurnitureModelRenderer />`）**:
   - `procedural` (`shapeType: 'custom'`) → `CustomProceduralFurnitureMesh`（回転込み厳密バウンディングボックスで底面中央接地＋実寸自動フィット、アンマウント時 `dispose()`）
   - `procedural`（定型）→ `ProceduralFurnitureMesh`（12 形状＋`partsHint`）
   - `glb` → `GlbFurnitureMesh`（`useGLTF`＋`THREE.Box3` 実寸フィット・底面中央補正。`Suspense` 仮表示と `GlbErrorBoundary` フォールバック付き）
2. **生成抽象化（`FurnitureGenerationProvider`）**:
   - UI は `getFurnitureGenerationProvider()` 経由で `analyzeImage()` / `reconstructFromImage()` / `generateModel()` を呼び出す。
   - 現行は `ProceduralFurnitureProvider`。外部 GLB API 接続時は `GlbFurnitureProvider` を実装し `src/services/furniture/provider.ts` のファクトリを切り替えるのみで移行可能。

---

## 5. 永続化・バックアップ

### IndexedDB（`src/lib/db.ts` / Dexie）
- **DB 名**: `moving-3d-planner-db`
- **テーブル**: `properties` (`id, updatedAt`) / `catalog` (`id, category, updatedAt`) / `appMeta` (`key`: `activePropertyId`)
- **初期シード（`seed-data.ts`）**: DB が空の場合、サンプル物件 2 件（南向き 1LDK / 駅近 1K）と家具カタログ 10 点を自動投入。

### JSON エクスポート／インポート（`src/lib/storage-io.ts`）
- **形式**: `PlannerExportPayload`（`schemaVersion: 1`, `exportedAt`, `catalog`, `properties`, `activePropertyId`）を `moving-3d-planner-YYYYMMDD-HHMM.json` で出力。
- **検証**: 構文・バージョン・必須フィールド・寸法・モデル仕様（`customModel` の `designDimensionsCm` / `parts` を含む）を検証し事前プレビュー表示。
- **モード**: `merge`（追加マージ・ID 衝突時は新 ID リマップ＋`assetId` 自動追従） / `replace`（確認後に全置換復元）。

---

## 6. 環境変数・セキュリティ

| 環境変数 | 必須 | 説明 |
| --- | --- | --- |
| `GEMINI_API_KEY` | AI 機能利用時 | Google Gemini API キー（サーバー側 Route Handler のみで参照） |
| `GEMINI_MODEL` | 任意 | 使用モデル名（未設定時は `gemini-2.5-flash`） |

- API キーは `.env.local`（Git 管理外・雛形 `.env.local.example`）で管理し、クライアント側へは一切露出しません。
