"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { PhotoRecord, PhotoCategory } from "@/lib/types";
import { PHOTO_CATEGORIES, DATA_SCHEMA_VERSION } from "@/lib/types";
import {
  loadPhotosMeta,
  savePhotosMeta,
  saveImage,
  loadImage,
  bulkDeletePhotos,
  deletePhotoRecord,
  generateThumbnail,
  generateDeliveryName,
  computeSHA256,
  thumbnailToDataURL,
} from "@/lib/photo-store";
import { useToast } from "@/lib/toast";
import PhotoEditor from "./editor";

export default function PhotosPage() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [filterCategory, setFilterCategory] = useState<PhotoCategory | "全て">("全て");
  const [showUpload, setShowUpload] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // 初期読み込み
  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadPhotosMeta();
        setPhotos(loaded);
        // サムネイル読み込み
        const thumbs: Record<string, string> = {};
        for (const p of loaded) {
          if (p.thumbnailKey) {
            thumbs[p.id] = await thumbnailToDataURL(p.thumbnailKey);
          } else if ((p as unknown as Record<string, string>).thumbnail) {
            // v1互換：旧thumbnailフィールド
            thumbs[p.id] = (p as unknown as Record<string, string>).thumbnail;
          }
        }
        setThumbnails(thumbs);
      } catch (e) {
        toast("写真データの読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const refreshPhotos = async () => {
    const loaded = await loadPhotosMeta();
    setPhotos(loaded);
    const thumbs: Record<string, string> = {};
    for (const p of loaded) {
      if (p.thumbnailKey) {
        thumbs[p.id] = await thumbnailToDataURL(p.thumbnailKey);
      } else if ((p as unknown as Record<string, string>).thumbnail) {
        thumbs[p.id] = (p as unknown as Record<string, string>).thumbnail;
      }
    }
    setThumbnails(thumbs);
  };

  const filtered =
    filterCategory === "全て"
      ? photos
      : photos.filter((p) => p.category === filterCategory);

  const categoryCounts = PHOTO_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = photos.filter((p) => p.category === cat).length;
      return acc;
    },
    {} as Record<string, number>
  );

  const handleDelete = async (id: string) => {
    if (!confirm("この写真を削除しますか？")) return;
    try {
      await deletePhotoRecord(id);
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      await refreshPhotos();
      toast("写真を削除しました", "success");
    } catch {
      toast("削除に失敗しました", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}枚の写真を削除しますか？`)) return;
    try {
      await bulkDeletePhotos(selectedIds);
      setSelectedIds(new Set());
      await refreshPhotos();
      toast(`${selectedIds.size}枚を削除しました`, "success");
    } catch {
      toast("一括削除に失敗しました", "error");
    }
  };

  const handlePreview = async (photo: PhotoRecord) => {
    const key = photo.hasBlackboardOverlay ? photo.overlayImageKey : photo.imageKey;
    const blob = await loadImage(key);
    if (blob) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewPhoto(photo.id);
    } else {
      toast("画像が見つかりません", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const editTarget = editingPhoto ? photos.find((p) => p.id === editingPhoto) : null;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400">
        <p className="text-lg">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">工事写真管理</h1>
          <p className="text-gray-500 text-sm mt-1">写真 {photos.length}枚 登録済み</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              {selectedIds.size}枚を削除
            </button>
          )}
          <button onClick={() => setShowUpload(true)} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">
            写真を追加
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <FilterButton label={`全て (${photos.length})`} active={filterCategory === "全て"} onClick={() => setFilterCategory("全て")} />
        {PHOTO_CATEGORIES.map((cat) => (
          <FilterButton key={cat} label={`${cat} (${categoryCounts[cat] || 0})`} active={filterCategory === cat} onClick={() => setFilterCategory(cat)} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">写真がありません</p>
          <p className="text-sm mt-2">「写真を追加」ボタンから写真をアップロードしてください</p>
        </div>
      ) : (
        <div className="photo-grid">
          {filtered.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              thumbnail={thumbnails[photo.id] || ""}
              selected={selectedIds.has(photo.id)}
              onToggleSelect={() => toggleSelect(photo.id)}
              onPreview={() => handlePreview(photo)}
              onEdit={() => setEditingPhoto(photo.id)}
              onDelete={() => handleDelete(photo.id)}
            />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal
          photoCount={photos.length}
          onClose={() => setShowUpload(false)}
          onUploaded={async () => {
            await refreshPhotos();
            setShowUpload(false);
            toast("アップロード完了", "success");
          }}
        />
      )}

      {editTarget && (
        <PhotoEditor
          photo={editTarget}
          onClose={() => setEditingPhoto(null)}
          onSaved={async () => {
            await refreshPhotos();
            setEditingPhoto(null);
            toast("保存しました", "success");
          }}
        />
      )}

      {previewPhoto && previewUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewPhoto(null); setPreviewUrl(null); }}>
          <img src={previewUrl} alt="プレビュー" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${active ? "bg-orange-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
      {label}
    </button>
  );
}

function PhotoCard({ photo, thumbnail, selected, onToggleSelect, onPreview, onEdit, onDelete }: {
  photo: PhotoRecord; thumbnail: string; selected: boolean;
  onToggleSelect: () => void; onPreview: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 overflow-hidden transition-colors ${selected ? "border-orange-500" : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"}`}>
      <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-700 cursor-pointer" onClick={onPreview}>
        {thumbnail && <img src={thumbnail} alt={photo.title} className="w-full h-full object-cover" />}
        {photo.hasBlackboardOverlay && <span className="absolute top-1 right-1 bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded">黒板付</span>}
        {photo.sha256 && <span className="absolute top-1 right-8 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">検証済</span>}
        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{photo.category}</span>
        <div className="absolute top-1 left-1" onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}>
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${selected ? "bg-orange-600 border-orange-600" : "bg-white/80 border-gray-400"}`}>
            {selected && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12"><path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
          </div>
        </div>
      </div>
      <div className="p-2">
        <p className="text-sm font-medium truncate">{photo.title || "無題"}</p>
        <p className="text-xs text-gray-500 truncate">{photo.construction} / {photo.shotDate}</p>
        <p className="text-[10px] text-gray-400 truncate">{photo.deliveryName}</p>
        <div className="flex gap-1 mt-2">
          <button onClick={onEdit} className="flex-1 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">編集</button>
          <button onClick={onDelete} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400">削除</button>
        </div>
      </div>
    </div>
  );
}

/* ─── アップロードモーダル（#10修正：個別try-catch＋逐次保存） ─── */

function UploadModal({ photoCount, onClose, onUploaded }: {
  photoCount: number; onClose: () => void; onUploaded: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<PhotoCategory>("施工状況");
  const [construction, setConstruction] = useState("");
  const [type, setType] = useState("");
  const [detail, setDetail] = useState("");
  const [location, setLocation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles((prev) => [...prev, ...Array.from(e.target.files!).filter((f) => f.type.startsWith("image/"))]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    const errorList: string[] = [];
    let idx = photoCount;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(Math.round(((i + 1) / files.length) * 100));

      try {
        const { thumbnailBlob, width, height } = await generateThumbnail(file);
        const id = crypto.randomUUID();
        const imageKey = `img-${id}`;
        const thumbnailKey = `thumb-${id}`;
        const deliveryName = generateDeliveryName(idx + i);
        const today = new Date().toISOString().slice(0, 10);
        const sha256 = await computeSHA256(file);

        const record: PhotoRecord = {
          id,
          _v: DATA_SCHEMA_VERSION,
          originalName: file.name,
          deliveryName,
          category,
          construction,
          type,
          detail,
          title: file.name.replace(/\.[^.]+$/, ""),
          shotDate: today,
          location,
          blackboard: { 工事名: "", 工種: construction, 測点: "", 撮影日: today, 施工者名: "", 備考: "" },
          hasBlackboardOverlay: false,
          imageKey,
          overlayImageKey: "",
          thumbnailKey,
          width,
          height,
          fileSize: file.size,
          sha256,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await saveImage(imageKey, file);
        await saveImage(thumbnailKey, thumbnailBlob);

        // #10: 逐次メタデータ保存（途中でブラウザが閉じてもデータを失わない）
        const current = await loadPhotosMeta();
        current.push(record);
        await savePhotosMeta(current);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "不明なエラー";
        errorList.push(`${file.name}: ${msg}`);
      }
    }

    setErrors(errorList);
    if (errorList.length > 0) {
      toast(`${errorList.length}件のエラーがありました`, "warning");
    }
    onUploaded();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">工事写真アップロード</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>

          <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-orange-400 transition-colors mb-4">
            <p className="text-gray-500">ここにドラッグ＆ドロップ<br />またはクリックして選択</p>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {files.length > 0 && <p className="text-sm text-orange-600 font-medium mb-4">{files.length}枚のファイルが選択されています</p>}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">写真区分</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as PhotoCategory)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700">
                {PHOTO_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">工種</label>
              <input type="text" value={construction} onChange={(e) => setConstruction(e.target.value)} placeholder="例：土工、舗装工、擁壁工" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">種別</label>
                <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="例：掘削" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">細別</label>
                <input type="text" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="例：床掘り" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">撮影箇所</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例：No.5〜No.8" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700" />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
              <p className="font-medium mb-1">エラー一覧：</p>
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <button onClick={handleUpload} disabled={files.length === 0 || uploading}
            className="w-full mt-6 px-4 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {uploading ? `アップロード中... ${progress}%` : `${files.length}枚をアップロード`}
          </button>
        </div>
      </div>
    </div>
  );
}
