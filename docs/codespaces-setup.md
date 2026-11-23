# GitHub Codespaces / Dev Container 起動ガイド

`.devcontainer/devcontainer.json`（Node.js 22・`npm install` 自動実行・ポート `3000` 自動フォワード）を使い、環境構築の手間なく起動できます。

| 起動方法 | 手元 PC に必要なもの | 向いている用途 |
| --- | --- | --- |
| **GitHub Codespaces** | GitHub アカウントのみ | 環境構築なしで今すぐ試す・別 PC から使う |
| **VS Code Dev Containers** | Docker, VS Code, Dev Containers 拡張 | ローカル環境を汚さず高速に動かす |

---

## 方法 1: GitHub Codespaces（環境構築不要）

### 1. 環境変数を設定する（AI 解析を使う場合のみ）

> AI 解析（間取り図 AI 解析・家具写真 AI 解析 / 3D 構築）を使わない場合はスキップできます。

- **方法 A: Codespaces Secrets（おすすめ）**
  - GitHub `Settings` → `Codespaces` → `Secrets` → `New secret` で以下を登録し、本リポジトリへアクセス許可します。
  - 起動済み Codespace に反映する場合はコマンドパレットから `Codespaces: Reload` を実行します。

  | Secret 名 | 内容 | 必須 |
  | --- | --- | --- |
  | `GEMINI_API_KEY` | Gemini API キー | AI 解析利用時 |
  | `GEMINI_MODEL` | モデル名（例: `gemini-2.5-flash` / `gemini-4-hydrogen`） | 任意（既定: `gemini-2.5-flash`） |

- **方法 B: `.env.local` ファイル**
  - Codespace 起動後に `cp .env.local.example .env.local` を実行し、`GEMINI_API_KEY` を記入します（Git 除外済み）。

### 2. Codespace を作成して起動する

1. GitHub リポジトリで **`<> Code`** → **`Codespaces`** → **`Create codespace on main`** をクリック
2. 初回セットアップ（`npm install` 完了まで 1〜2 分）を待つ
3. ターミナルで開発サーバーを起動する
   ```bash
   npm run dev
   ```
4. ポート `3000` の通知（`Next.js App`）から **`Open in Browser`** をクリック（通知を閉じた場合は「PORTS」タブから開けます）

### 利用時の注意点

- **バックアップ（重要）**: データはブラウザの IndexedDB に URL 単位で保存されます。Codespace を作り直すと URL が変わりデータが引き継がれないため、作業の区切りで **「JSON保存/読込」** からエクスポートしてください。
- **ポート公開範囲**: ポート `3000` は既定の **Private** のまま利用してください。
- **終了時の停止**: 無料枠の消費を防ぐため、使い終わったら **Stop Current Codespace** で停止してください。

---

## 方法 2: VS Code Dev Containers（ローカル Docker）

### 前提
- Docker が起動していること
- VS Code ＋ 拡張機能 **Dev Containers**（`ms-vscode-remote.remote-containers`）

### 手順

1. リポジトリをクローンして VS Code で開く
   ```bash
   git clone https://github.com/llillillj/moving-3d-planner.git
   cd moving-3d-planner
   code .
   ```
2. コマンドパレットから **`Dev Containers: Reopen in Container`** を実行（自動で `npm install` まで完了）
3. （AI 解析を使う場合）`cp .env.local.example .env.local` で `GEMINI_API_KEY` を設定
4. ターミナルで `npm run dev` を実行し、`http://localhost:3000` を開く

---

## 関連ドキュメント

- [README.md](../README.md)
- [実装仕様書](./specification.md)
