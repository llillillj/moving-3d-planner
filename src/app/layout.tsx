import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '間取り3Dプランナー | 引っ越し家具配置シミュレーター',
  description:
    '複数の引っ越し候補物件を比較しながら、手持ち家具を実寸(cm)で3D配置してサイズ感を確認できるシミュレーターです。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
