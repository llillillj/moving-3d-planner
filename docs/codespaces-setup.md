# GitHub Codespaces / Dev Container での起動ガイド

このプロジェクトには `.devcontainer/devcontainer.json` があらかじめ用意されています。
**GitHub Codespaces** を使えば、手元の PC に Node.js などの開発環境を一切インストールせず、ブラウザだけでアプリを起動して使えます。

また、手元の PC に Docker 環境がある場合は、同じ設定を使って **VS Code Dev Containers** でローカル起動することもできます。

---

## 起動方法の比較

| 起動方法 | 手元 PC の環境構築 | 必要なもの | おすすめの用途 |
| --- | --- | --- | --- |
| **GitHub Codespaces** | **不要**（ブラウザだけで完結） | GitHub アカウント | 環境構築なしで今すぐ試したい・別 PC からも使いたい |
| **VS Code Dev Containers** | Docker ＋ VS Code のみ | Docker, VS Code, Dev Containers 拡張 | 普段から Docker を使っており、ローカル高速起動したい |
| **ローカル直接起動** | Node.js 22 等が必要 | Node.js, npm | すでに Node.js 環境が整っている場合 |

---

## 方法 1: GitHub Codespaces で起動する（環境構築不要）

### 1. （AI 解析を使う場合）環境変数を準備する

AI 解析機能（間取り図 AI 解析・家具写真 AI 解析）を使うには `GEMINI_API_KEY` が必要です。
> **補足**: AI 解析を使わない場合（3D 家具配置・2D 間取り編集・手動家具登録・JSON 保存/読込のみ）は、環境変数の設定なしでそのままステップ 2 へ進めます。

Codespaces では、以下の **A または B** のどちらかで環境変数を設定できます。

#### A. GitHub の Codespaces Secrets に登録する（おすすめ）

GitHub アカウントに Secrets として登録しておくと、Codespace を立ち上げるたびに環境変数として自動注入されます。コンテナ内に `.env.local` を作成する手間がなく、鍵ファイルを誤って扱う心配もありません。

1. GitHub 右上のプロフィールアイコン → **Settings** を開く
2. 左メニューの **Codespaces** → **Secrets** セクションで **New secret** をクリック
3. 以下のキーを登録し、**Repository access** で本リポジトリを選択して保存する

| Secret 名 | 設定内容 | 必須 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini API キー | AI 解析を使う場合は必須 |
| `GEMINI_MODEL` | 使用するモデル名（例: `gemini-2.5-flash` / `gemini-4-hydrogen`） | 任意（未設定時は `gemini-2.5-flash`） |

> すでに起動済みの Codespace がある場合は、Secrets 追加後に Codespace の画面上部に表示される再読み込み案内（またはコマンドパレットの `Codespaces: Reload`）で反映してください。

#### B. Codespace 内に `.env.local` ファイルを作成する

Secrets を使わず、起動した Codespace 内のファイルで直接設定する方法です。モデルを頻繁に切り替えたい場合にも便利です。

```bash
cp .env.local.example .env.local
```

作成した `.env.local` をエディタで開き、API キーなどを記入します（`.env.local` は `.gitignore` 対象のため Git 管理から除外されています）。

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

---

### 2. Codespace を作成・起動する

1. GitHub でこのリポジトリのページを開く
2. 緑色の **`<> Code`** ボタンをクリックし、**`Codespaces`** タブを選択する
3. **`Create codespace on main`** をクリックする
4. ブラウザ上で VS Code が開き、`.devcontainer/devcontainer.json` に基づいて以下が自動実行されます
   - Node.js 22 開発コンテナの立ち上げ
   - `npm install` の自動実行（`postCreateCommand`）

> 初回起動時はパッケージインストールのため 1〜2 分ほどかかる場合があります。ターミナルのプロンプトが入力可能になるまで待ってください。

---

### 3. 開発サーバーを起動してブラウザで開く

1. Codespace 下部のターミナルで以下を実行する

```bash
npm run dev
```

2. ポート `3000` が自動でポートフォワードされ、右下に **「Next.js App」** の通知が表示されます
3. 通知の **`Open in Browser`** をクリックすると、新しいタブで Moving 3D Planner が開きます
   - 通知を閉じてしまった場合は、下部パネルの **「ポート（PORTS）」** タブにあるポート `3000` 行の地球アイコン（ブラウザで開く）から開けます

---

### Codespaces 利用時のポイント・注意点

- **データの保存先とバックアップ（重要）**:
  - 作成した物件データ・間取り図・マイ家具カタログは、**ブラウザ内の IndexedDB** に「URL（オリジン）ごと」に保存されます。
  - Codespace を削除して作り直すと URL（`https://*.app.github.dev`）が変わり、以前の IndexedDB データが見えなくなります。
  - 作業の区切りでは、アプリ右上の **「JSON保存/読込」** からバックアップファイルをダウンロードしておくことをおすすめします。
- **ポートの公開範囲**:
  - ポート `3000` は既定で **Private**（自分の GitHub アカウントでログインしたブラウザからのみアクセス可能）になっています。基本的には Private のまま利用してください。
- **使い終わったら停止する**:
  - GitHub Codespaces には無料利用枠がありますが、起動したまま放置すると稼働時間が消費されます（一定時間無操作で自動停止もされます）。使い終わったらメニューから **Stop Current Codespace** を実行しておくと安心です。

---

## 方法 2: ローカル PC で VS Code Dev Containers を使う（Docker 環境がある場合）

PC に Docker がインストールされている場合は、同じ `.devcontainer/devcontainer.json` を使ってローカル環境を汚さずに VS Code からワンクリックで起動できます。

### 前提条件

- Docker（Docker Desktop / Rancher Desktop / OrbStack など）が起動していること
- Visual Studio Code
- VS Code 拡張機能: **Dev Containers**（`ms-vscode-remote.remote-containers`）

### 起動手順

1. リポジトリをクローンし、VS Code でフォルダを開く
   ```bash
   git clone https://github.com/llillillj/moving-3d-planner.git
   cd moving-3d-planner
   code .
   ```
2. 右下に表示される **「コンテナーで再度開く（Reopen in Container）」** をクリックする
   - 表示されない場合はコマンドパレット（`Ctrl+Shift+P` / macOS は `Cmd+Shift+P`）から **`Dev Containers: Reopen in Container`** を実行
3. コンテナの構築と `npm install` が自動で完了するのを待つ
4. （AI 解析を使う場合）`.env.local` を作成し、`GEMINI_API_KEY` などを設定する
   ```bash
   cp .env.local.example .env.local
   ```
5. VS Code のターミナルで開発サーバーを起動する
   ```bash
   npm run dev
   ```
6. ブラウザで `http://localhost:3000` を開く

---

## 関連ドキュメント

- [README.md](../README.md)
- [実装仕様書 (specification.md)](./specification.md)
