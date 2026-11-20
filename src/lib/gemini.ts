import { GoogleGenAI } from '@google/genai';

/**
 * サーバー側で使用する Gemini モデル名を解決する（GEMINI.md 規約）
 */
export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

export class MissingGeminiApiKeyError extends Error {
  constructor() {
    super(
      'GEMINI_API_KEY が設定されていません。プロジェクト直下の .env.local に GEMINI_API_KEY=... を設定し、開発サーバーを再起動してください。',
    );
    this.name = 'MissingGeminiApiKeyError';
  }
}

/**
 * サーバー側専用の @google/genai クライアントを生成する
 */
export function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new MissingGeminiApiKeyError();
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Data URL (data:image/...;base64,...) から mimeType と純粋な base64 文字列を抽出する
 */
export function parseImageDataUrl(
  imageDataUrl: string,
  fallbackMimeType = 'image/jpeg',
): { mimeType: string; base64Data: string } {
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1] || fallbackMimeType,
      base64Data: match[2],
    };
  }
  return {
    mimeType: fallbackMimeType,
    base64Data: imageDataUrl,
  };
}

/**
 * 万一 ```json ... ``` のコードフェンスが含まれていても安全に JSON 文字列を取り出す
 */
export function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
