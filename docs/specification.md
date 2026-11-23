# Moving 3D Planner 実装仕様書

本ドキュメントは、引っ越し検討者向けの 3D/2D 家具配置・物件比較シミュレーター **Moving 3D Planner（間取り3Dプランナー）** の実装仕様を要約したものです。

---

## 1. 基本方針と座標系

### 基本方針
- **UI・応答言語**: すべて日本語で統一する。
- **重視する体験**: 物理干渉チェックや通路幅警告などの複雑なチェック機能は意図的に実装せず、**家具の配置しやすさ**と**サイズ感の視覚確認（3D俯瞰・真上・一人称）**を最優先する。
- **クライアント完結型データ管理**: ユーザーが登録した物件・間取り図・家具カタログはすべてブラウザ内の IndexedDB に保存し、サーバー側への永続化は行わない。

### 座標系と単位
| 項目 | 仕様 |
| --- | --- |
| 3D 空間・内部データ | `1単位 = 1メートル (m)`、右手系（Y軸 = 高さ、XZ平面 = 床面） |
| 家具・固定設備の基準点 | 底面中央 `(centerX, bottomY, centerZ)` をローカル原点とする |
| ユーザー向け UI 表示・入力 | すべて `cm` 表記に統一（角度は `度`）。`src/lib/units.ts` で内部値（`m` / ラジアン）と相互変換 |

---

## 2. 技術スタック・構成

### 技術スタック
- **フレームワーク**: Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS v4
- **3D 描画**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **状態管理**: Zustand (`src/store/usePlannerStore.ts`)
- **ローカル永続化**: IndexedDB (`dexie`) ＋ JSON エクスポート／インポート
- **AI 解析**: `@google/genai`（Next.js Route Handler 経由でサーバー側実行。使用モデル: `process.env.GEMINI_MODEL || "gemini-2.5-flash"`）

### 主要ディレクトリ構成
```text
src/
├── app/
│   ├── page.tsx                         # エントリページ
│   └── api/
│       ├── analyze-floorplan/route.ts   # 間取り図AI解析 API
│       ├── analyze-furniture/route.ts   # 家具写真AI解析・3Dパーツ構築 API
│       └── reconstruct-furniture/route.ts # 家具写真からの3Dパーツ再構築専用 API
├── components/
│   ├── layout/                          # ワークスペース枠（HeaderBar, LeftSidebar, InspectorPanel, DataTransferModal）
│   ├── viewport3d/                      # 3D空間描画（RoomCanvas3D, RoomStructure3D, CameraController, FixedFixtureMesh, PlacedFurnitureItem）
│   │   └── models/                      # 家具描画抽象層（FurnitureModelRenderer, ProceduralFurnitureMesh, CustomProceduralFurnitureMesh, GlbFurnitureMesh）
│   ├── editor2d/                        # 2D間取りエディタ（FloorplanEditor2D, FloorplanUploadModal, ScaleCalibrationModal）
│   └── furniture/                       # 家具登録モーダル・3Dプレビュー（FurnitureRegisterModal, FurniturePreview3D）
├── services/furniture/                  # 家具解析・モデル生成プロバイダ層（provider.ts, procedural-provider.ts, glb-provider.ts）
├── store/usePlannerStore.ts             # Zustand ストア（状態管理＋IndexedDB非同期保存）
├── lib/                                 # DB, シードデータ, ジオメトリ計算, 座標変換, 画像リサイズ, JSON入出力, Gemini初期化
└── types/planner.ts                     # ドメインモデル・API型定義
```

---

## 3. データモデルとデータ分離設計

複数物件を同じ手持ち家具で比較しやすくするため、**マイ家具カタログ**と**物件データ**を分離して管理します（型定義: `src/types/planner.ts`）。

### 3.1 マイ家具カタログ（全物件共通）
- `FurnitureAsset`: 家具のマスターデータ（`id`, `name`, `category`, `dimensions`, `model`, `thumbnailDataUrl?`, `memo?`）。
- `model` フィールドは以下の判別共用体（`FurnitureModelSpec`）とし、プロシージャルと GLB を透過的に扱う。
  ```ts
  type FurnitureModelSpec =
    | {
        kind: 'procedural';
        shapeType: ProceduralShapeType;
        color: string;
        partsHint?: string[];
        customModel?: CustomProceduralModel;
      }
    | { kind: 'glb'; url: string; normalizeScale: boolean };
  ```

### 3.2 物件データ（`Property`）
各物件は独立して以下を保持します。
- **間取り図背景 (`FloorplanImage`)**: リサイズ済み Data URL、ピクセル寸法、スケール係数 (`metersPerPixel`)、オフセット、透過度、表示ON/OFF。
- **縮尺補正記録 (`ScaleCalibration`)**: 基準2点と実寸 (m) の履歴。
- **壁構造 (`WallVertex[]`, `WallSegment[]`)**: 頂点共有グラフ構造。各壁は厚み・高さ・種別（外壁 `exterior` / 間仕切り `interior` / 腰壁 `low_wall`）と建具（`WallOpening[]`: ドア・引き戸・窓・開口）を持つ。
- **部屋ゾーン (`RoomZone[]`)**: 床の色分けや部屋名表示用の任意ポリゴン。
- **備え付け固定設備 (`FixedFixture[]`)**: キッチン・浴槽・トイレ・洗面台・洗濯機パン・クローゼット・シューズボックス・エアコン等。誤操作防止のため AI 解析・プリセット由来は初期状態 `locked: true` とし、必要時のみロック解除して移動・リサイズ可能。
- **レイアウト案 (`LayoutVariant[]`)**: 同一物件内で複数パターン（「案1」「案2」等）を作成・切替可能。各配置インスタンス（`PlacedFurniture`）は `assetId` でカタログを参照し、位置・Y軸回転・個別の寸法上書き (`dimensionsOverride`)・ロック状態を持つ。

### 3.3 永続化対象外の UI 状態
エディタ表示モード (`3d` / `2d` / `split`)、カメラ視点モード (`perspective` / `top` / `first_person`)、天井・グリッド表示、スナップ設定、選択エンティティ、ドラッグ中フラグ等はメモリ上のみで管理し IndexedDB には保存しません。

---

## 4. 主要機能仕様

### 4.1 物件・レイアウト案管理（`HeaderBar`）
- 物件の切替、新規作成（標準 5m×4m の基本部屋生成）、複製、名称変更、削除（最低1件維持）、メモ・標準天井高 (cm) 編集。
- 物件内での配置案（`LayoutVariant`）の切替、複製、空案追加、名称変更、削除（最低1案維持）。
- 初期サンプルデータへのリセット機能。

### 4.2 3D 家具配置ビュー（`RoomCanvas3D`）
- **視点モード切替（`CameraController`）**:
  - `perspective`（斜め俯瞰）: OrbitControls による自由回転・ズーム・パン。
  - `top`（真上2D風）: 回転ロック＋平面パンによる俯瞰確認。
  - `first_person`（一人称）: 成人目線高さ `1.55m` で部屋内に配置。左ドラッグで見渡し、WASD / 矢印キーで水平歩行。
- **配置操作と補助**:
  - 家具ドラッグによる床面移動、選択時の回転ハンドル（青ノブ）による回転。
  - 移動スナップ（`5cm` 刻み / 自由移動）、角度スナップ（`90°` / 自由回転）、`Shift` キーによるスナップ一時解除。
  - キーボードショートカット: `R` / `Shift+R`（90°回転）、`Delete` / `Backspace`（削除）、`Esc`（選択解除）。
  - 天井表示 ON/OFF、50cm/1m グリッド表示 ON/OFF、視点リセット、部屋外寸と天井高の常時表示。
- **インスペクタ（`InspectorPanel`）**:
  - 選択中エンティティ（家具・固定設備・壁・頂点）に応じて位置・回転・寸法 (cm)・建具・ロック状態等を数値編集可能。

### 4.3 2D 間取りエディタ（`FloorplanEditor2D`）
- **表示モード**: `3D 家具配置` / `2D 間取り編集` / `2D+3D 同時`（左右分割で2D編集を3Dへリアルタイム反映）。
- **作図・編集ツール**:
  - `select`（選択・移動）: 頂点ドラッグ移動、近接頂点の自動マージ、ロック解除済み固定設備の移動および四隅リサイズ。
  - `draw_wall`（壁追加）: 頂点・軸スナップ付きで連続的に壁線分を追加。
  - `split_wall`（壁分割）: 既存壁上の任意位置をクリックして頂点挿入・2分割。
  - `calibrate`（縮尺補正）: 任意の2点（または選択中の壁の両端）に対して実寸 (cm) を入力し、物件全体の頂点・壁・設備・配置家具・背景画像を比例スケーリング。
- **背景画像・オーバーレイ**: 間取り図画像の表示 ON/OFF・透過度調整、配置済み家具の2Dオーバーレイ表示。

### 4.4 AI 解析機能（Gemini API）
ブラウザ側（`src/lib/image-utils.ts`）でアップロード画像を事前にリサイズ・白背景合成して Data URL 化し、サーバー側 Route Handler から Gemini API の構造化出力（`responseMimeType: "application/json"` + `responseSchema`）で解析します。

| エンドポイント | 入力（リサイズ上限） | 抽出内容と後処理 |
| --- | --- | --- |
| `POST /api/analyze-floorplan` | 間取り図画像（長辺最大 `1600px`） | 正規化座標 (`0〜1000`) で頂点・壁・建具・固定設備・推定画像横幅 (m) を抽出。`floorplan-converter.ts` でワールド座標 (m) に変換し、8cm 以内の近接頂点を自動マージ、固定設備は `locked: true` で登録。AI解析を使わず画像のみを背景敷きするモードにも対応。 |
| `POST /api/analyze-furniture` | 家具写真（解析用 `1024px` / サムネイル `320px`） | 家具名案、カテゴリ、代表色 (HEX)、定型形状タイプ（12種）、視覚特徴 (`partsHint`)、目安寸法、箇所別採寸ヒントを抽出。`mode: 'reconstruct'` 指定時は写真の家具を複数3Dプリミティブパーツで立体再現する `customModel` も同時生成。対話型フォームで「AI画像再現」と「定型テンプレート」を自由に切り替え、実寸 (cm) 入力・3Dプレビュー確認後にカタログへ登録。 |
| `POST /api/reconstruct-furniture` | 家具写真 ＋ 任意の実寸 (cm) ・微調整ヒント | 写真固有の構造（脚・天板・棚・クッション・色分け・質感等）を 8〜36 個程度のプリミティブパーツ (`box`, `rounded_box`, `cylinder`, `sphere`, `capsule`, `cone`, `torus`, `arch`) へ分解して `CustomProceduralModel` を構築・再構築。実寸入力後の比率合わせや既存家具の編集画面からのアップグレードにも対応。 |

### 4.5 将来のリアル 3D モデル (GLB) 移行アーキテクチャ
初期実装のプロシージャル形状から外部 Image-to-3D API（`.glb`）へ最小限の変更で差し替えられるよう、以下2層を抽象化しています。

1. **描画層の統一（`<FurnitureModelRenderer />`）**:
   - `asset.model.kind === 'procedural'` かつ `shapeType === 'custom'`（`customModel` あり）→ `CustomProceduralFurnitureMesh`（AI構築パーツ群の回転込み厳密バウンディングボックスを算出し、底面中央 `(0, 0, 0)` 接地＋実寸 `dimensions` へ自動フィット）。
   - `asset.model.kind === 'procedural'`（定型）→ `ProceduralFurnitureMesh`（12形状 + `partsHint` によるパーツ表現）。
   - `asset.model.kind === 'glb'` → `GlbFurnitureMesh`（`useGLTF` で読み込み、`normalizeScale: true` 時は `THREE.Box3` から実寸 `dimensions` へ自動フィット＋底面中央を原点 `(0, 0, 0)` に補正）。`Suspense` による仮ワイヤーフレーム表示と `GlbErrorBoundary` によるフォールバック描画を内包。
2. **生成ロジックの抽象化（`FurnitureGenerationProvider`）**:
   - UI（`FurnitureRegisterModal`）は `getFurnitureGenerationProvider()` 経由で `analyzeImage()` / `reconstructFromImage()` / `generateModel()` のみを呼び出す。
   - 現行は `ProceduralFurnitureProvider` を返却。将来外部 GLB 生成 API を接続する際は `GlbFurnitureProvider` を実装して `src/services/furniture/provider.ts` のファクトリを切り替えるだけで移行可能。

---

## 5. データ永続化・バックアップ仕様

### IndexedDB（Dexie）
- **DB 名**: `moving-3d-planner-db`（`src/lib/db.ts`）
- **テーブル構成**:
  - `properties` (`id, updatedAt`)
  - `catalog` (`id, category, updatedAt`)
  - `appMeta` (`key`) — `activePropertyId` を保持
- **初期シードデータ（`src/lib/seed-data.ts`）**: 初回起動時など DB が空の場合に、サンプル物件2件（`南向き1LDK` / `駅近1K`）と汎用家具カタログ10点を自動投入する。

### JSON エクスポート／インポート（`src/lib/storage-io.ts`）
- **エクスポート形式**: `PlannerExportPayload`（`schemaVersion: 1`, `exportedAt`, `catalog`, `properties`, `activePropertyId`）を `moving-3d-planner-YYYYMMDD-HHMM.json` としてダウンロード。
- **インポート検証**: 構文・バージョン・必須フィールド・寸法・モデル仕様を検証し、事前プレビューを表示。
- **インポートモード**:
  - `merge`（追加マージ）: 既存データを保持し、ID 衝突時は新 ID へ自動リマップ（配置済み家具の `assetId` 参照も自動追従）。
  - `replace`（全置換復元）: 確認ダイアログのうえ全データを置き換え。

---

## 6. 環境変数・セキュリティ

| 環境変数 | 必須 | 説明 |
| --- | --- | --- |
| `GEMINI_API_KEY` | AI機能利用時 | Google Gemini API キー（サーバー側 Route Handler のみで参照） |
| `GEMINI_MODEL` | 任意 | 使用する Gemini モデル名（未設定時は `gemini-2.5-flash`） |

- API キーは `.env.local` に配置し、Git 管理対象外とする（テンプレートとして `.env.local.example` を提供）。
- クライアント（ブラウザ）側へ API キーは露出しない。
