"use client";

// 写真を大きく拡大して確認するためのモーダル（ライトボックス）。
// サムネイル一覧はサーバーコンポーネント側でそのまま作れるよう、以下の2部品に分けている:
//   - <PhotoLightboxGroup photos={...}> ひとまとまりの写真グループ（開閉状態・現在位置を保持）
//   - <PhotoLightboxThumbnail index={n}> グループ内のn番目のサムネイル（クリックで拡大表示を開く）
// グループ内に複数枚あれば、モーダル内で「前へ／次へ」（キーボードの←→キーにも対応）でめくれる。
// 新規npm依存を増やさない方針（このプロジェクト全体で一貫している）に沿い、
// React標準機能とTailwindのみで実装している。

import { createContext, useContext, useEffect, useState } from "react";

export type LightboxPhoto = {
  id: string;
  url: string;
  caption?: string | null;
};

const LightboxContext = createContext<{ open: (index: number) => void } | null>(null);

export function PhotoLightboxGroup({
  photos,
  children,
}: {
  photos: LightboxPhoto[];
  children: React.ReactNode;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <LightboxContext.Provider value={{ open: setOpenIndex }}>
      {children}
      {openIndex !== null && photos[openIndex] && (
        <LightboxModal photos={photos} index={openIndex} onClose={() => setOpenIndex(null)} onNavigate={setOpenIndex} />
      )}
    </LightboxContext.Provider>
  );
}

export function PhotoLightboxThumbnail({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(LightboxContext);
  return (
    <button type="button" onClick={() => ctx?.open(index)} className={className ?? "block w-full text-left"}>
      {children}
    </button>
  );
}

function LightboxModal({
  photos,
  index,
  onClose,
  onNavigate,
}: {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < photos.length - 1) onNavigate(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, photos.length, onClose, onNavigate]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded bg-white/10 px-3 py-1 text-lg text-white hover:bg-white/20"
        aria-label="閉じる"
      >
        ✕
      </button>

      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-white/10 px-3 py-2 text-2xl text-white hover:bg-white/20 sm:left-4"
          aria-label="前の写真"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-white/10 px-3 py-2 text-2xl text-white hover:bg-white/20 sm:right-4"
          aria-label="次の写真"
        >
          ›
        </button>
      )}

      <div className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.caption ?? "写真"} className="max-h-[85vh] max-w-[90vw] rounded object-contain" />
        {(photo.caption || photos.length > 1) && (
          <div className="mt-2 text-center text-sm text-white">
            {photo.caption && <p>{photo.caption}</p>}
            {photos.length > 1 && (
              <p className="text-xs text-white/70">
                {index + 1} / {photos.length}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
