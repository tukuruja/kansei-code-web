"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { loadPhotosMeta } from "@/lib/photo-store";
import { PHOTO_CATEGORIES } from "@/lib/types";

export default function Dashboard() {
  const [photoCount, setPhotoCount] = useState(0);
  const [withBlackboard, setWithBlackboard] = useState(0);
  const [withHash, setWithHash] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const photos = await loadPhotosMeta();
        setPhotoCount(photos.length);
        setWithBlackboard(photos.filter((p) => p.hasBlackboardOverlay).length);
        setWithHash(photos.filter((p) => p.sha256).length);
        const counts: Record<string, number> = {};
        PHOTO_CATEGORIES.forEach((cat) => { counts[cat] = photos.filter((p) => p.category === cat).length; });
        setCategoryCounts(counts);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400"><p>読み込み中...</p></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 rounded-2xl p-8 text-white mb-8">
        <h1 className="text-3xl font-bold mb-2">ツクルンジャー</h1>
        <p className="text-orange-100 text-lg">建設業の現場と経営をつなぐ統合管理プラットフォーム</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard title="登録写真" value={`${photoCount}枚`} sub={`黒板付: ${withBlackboard}枚`} href="/photos" color="blue" />
        <SummaryCard title="改ざん検証" value={`${withHash}枚`} sub="SHA-256ハッシュ記録済" href="/photos" color="green" />
        <SummaryCard title="電子納品" value={photoCount > 0 ? "出力可能" : "写真未登録"} sub="国交省準拠 PHOTO.XML" href="/delivery" color="orange" />
        <SummaryCard title="写真区分" value={`${Object.values(categoryCounts).filter((v) => v > 0).length}区分`} sub={`全${PHOTO_CATEGORIES.length}区分中`} href="/photos" color="purple" />
      </div>

      <h2 className="text-xl font-bold mb-4">機能メニュー</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <FeatureCard title="工事写真管理" description="写真のアップロード・分類・電子黒板合成。SHA-256で改ざん検知。" href="/photos" />
        <FeatureCard title="写真エディタ" description="電子黒板（3スタイル・ドラッグ・リサイズ）・マジック消しゴム。モバイル対応。" href="/photos" />
        <FeatureCard title="電子納品出力" description="国交省準拠のPHOTO.XML・INDEX_C.XMLを自動生成。ZIP一括出力。" href="/delivery" />
      </div>

      {photoCount > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold mb-4">写真区分別の状況</h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <div className="space-y-3">
              {PHOTO_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat] || 0;
                const pct = photoCount > 0 ? Math.round((count / photoCount) * 100) : 0;
                return (<div key={cat}><div className="flex justify-between text-sm mb-1"><span>{cat}</span><span className="text-gray-500">{count}枚 ({pct}%)</span></div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div></div>);
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ title, value, sub, href, color }: { title: string; value: string; sub: string; href: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
    green: "border-green-500 bg-green-50 dark:bg-green-950/30",
    orange: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
    purple: "border-purple-500 bg-purple-50 dark:bg-purple-950/30",
  };
  return (<Link href={href} className={`block rounded-xl border-l-4 p-5 ${colorMap[color] || colorMap.blue} hover:shadow-md transition-shadow`}>
    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p><p className="text-2xl font-bold mt-1">{value}</p><p className="text-xs text-gray-400 mt-1">{sub}</p>
  </Link>);
}

function FeatureCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (<Link href={href} className="block bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700">
    <h3 className="font-bold mb-2">{title}</h3><p className="text-sm text-gray-500">{description}</p>
  </Link>);
}
