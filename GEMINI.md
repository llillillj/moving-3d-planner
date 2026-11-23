# Moving 3D Planner - プロジェクト規約

## 基本方針
- 応答およびUIテキストはすべて日本語で行う。
- 物理干渉チェックや通路幅警告などの複雑なチェック機能は実装しない（配置のしやすさとサイズ感の視覚確認を最優先する）。

## 技術スタック
- Next.js (App Router / TypeScript / Tailwind CSS)
- 3D描画: Three.js, @react-three/fiber, @react-three/drei
- 状態管理: Zustand
- ローカル永続化: IndexedDB（`idb` または `dexie` を使用）＋ JSONエクスポート/インポート
- AI解析: `@google/genai`（サーバー側の Route Handler 経由で実行。モデルは `process.env.GEMINI_MODEL || "gemini-2.5-flash"` を使用）

## 座標系と単位
- 3D空間および内部データ: `1単位 = 1メートル`（Y軸が高さ、XZ平面が床面）。
- ユーザー向けUIの入力・表示: すべて `cm` 表記で統一し、内部で相互変換する。

## 必須のアーキテクチャ要件

### 1. 将来のリアル3Dモデル（GLB）移行を見据えた抽象化
家具の3D表現と生成ロジックは、初期実装のプロシージャル形状から外部Image-to-3D API（.glb）へ容易に差し替えられるインターフェースを維持すること。
- データモデル（`FurnitureAsset`）の `model` フィールドは判別共用体とする:
  - `{ kind: 'procedural'; shapeType: string; color: string; partsHint?: string[]; customModel?: CustomProceduralModel }`
  - `{ kind: 'glb'; url: string; normalizeScale: boolean }`
- 3D描画は `<FurnitureModelRenderer asset={asset} dimensions={dimensions} />` の単一コンポーネントに集約し、`kind` に応じてプロシージャル描画とGLB読み込み（バウンディングボックスを実寸 `dimensions` に自動フィットさせる処理を含む）を切り替えられる構造にする。
- 家具解析・生成は `FurnitureGenerationProvider` インターフェース越しに呼び出す設計にする。

### 2. データ分離（物件比較のしやすさ）
- **マイ家具カタログ (`FurnitureAsset[]`)**: ユーザーが画像とサイズで登録した手持ち家具のマスターデータ。全物件で共通利用する。
- **物件 (`Property[]`)**: 間取り図画像、スケール係数、壁（頂点＋線分）、建具（ドア・窓）、**備え付け固定設備 (`FixedFixture[]`)**、および複数の **レイアウト案 (`LayoutVariant[]`)** を持つ。
- **備え付け固定設備 (`FixedFixture`)**: 風呂・キッチン・トイレ・洗面台・洗濯機パン・備え付け収納など、間取り図から自動推定して初期配置される設備。誤操作防止のためデフォルトでロック状態とし、必要時のみロック解除して移動・リサイズ可能にする。