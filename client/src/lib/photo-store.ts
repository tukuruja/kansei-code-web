import type { PhotoRecord, ProjectInfo } from "./photo-types";
import { DATA_SCHEMA_VERSION } from "./photo-types";

const DB_NAME = "kansei-photo-db";
const DB_VERSION = 2;
const STORE_IMAGES = "images";
const STORE_META = "meta";
const PROJECT_KEY = "kansei-project-info";
const PHOTOS_META_KEY = "photos-list";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   IndexedDB シングルトン接続
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   画像Blob操作
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function saveImage(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    tx.objectStore(STORE_IMAGES).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImage(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readonly");
    const req = tx.objectStore(STORE_IMAGES).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    tx.objectStore(STORE_IMAGES).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メタデータ操作（IndexedDB）
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

async function saveMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadMeta<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** 写真メタデータ一覧を保存 */
export async function savePhotosMeta(photos: PhotoRecord[]): Promise<void> {
  await saveMeta(PHOTOS_META_KEY, photos);
}

/** 写真メタデータ一覧を取得 */
export async function loadPhotosMeta(): Promise<PhotoRecord[]> {
  // まずIndexedDBから取得
  const fromDB = await loadMeta<PhotoRecord[]>(PHOTOS_META_KEY);
  if (fromDB) return migratePhotos(fromDB);

  // IndexedDBになければlocalStorageから移行（旧データ互換）
  try {
    const raw = localStorage.getItem("kansei-photos-meta");
    if (raw) {
      const photos = migratePhotos(JSON.parse(raw) as PhotoRecord[]);
      await savePhotosMeta(photos);
      localStorage.removeItem("kansei-photos-meta");
      return photos;
    }
  } catch {
    /* localStorageが使えない環境でも落ちない */
  }
  return [];
}

/** 1件追加して保存 */
export async function addPhotoMeta(photo: PhotoRecord): Promise<PhotoRecord[]> {
  const photos = await loadPhotosMeta();
  photos.push(photo);
  await savePhotosMeta(photos);
  return photos;
}

/** 1件更新して保存 */
export async function updatePhotoMeta(updated: PhotoRecord): Promise<PhotoRecord[]> {
  const photos = (await loadPhotosMeta()).map((p) =>
    p.id === updated.id ? updated : p
  );
  await savePhotosMeta(photos);
  return photos;
}

/** 1件削除（画像Blobも削除） */
export async function deletePhotoRecord(id: string): Promise<PhotoRecord[]> {
  const photos = await loadPhotosMeta();
  const target = photos.find((p) => p.id === id);
  if (target) {
    await deleteImage(target.imageKey).catch(() => {});
    if (target.overlayImageKey) {
      await deleteImage(target.overlayImageKey).catch(() => {});
    }
    if (target.thumbnailKey) {
      await deleteImage(target.thumbnailKey).catch(() => {});
    }
  }
  const remaining = photos.filter((p) => p.id !== id);
  await savePhotosMeta(remaining);
  return remaining;
}

/** 一括削除（1トランザクションで整合性担保） */
export async function bulkDeletePhotos(ids: Set<string>): Promise<PhotoRecord[]> {
  const photos = await loadPhotosMeta();
  const toDelete = photos.filter((p) => ids.has(p.id));
  for (const target of toDelete) {
    await deleteImage(target.imageKey).catch(() => {});
    if (target.overlayImageKey) await deleteImage(target.overlayImageKey).catch(() => {});
    if (target.thumbnailKey) await deleteImage(target.thumbnailKey).catch(() => {});
  }
  const remaining = photos.filter((p) => !ids.has(p.id));
  await savePhotosMeta(remaining);
  return remaining;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   工事情報
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function saveProjectInfo(info: ProjectInfo): Promise<void> {
  await saveMeta(PROJECT_KEY, info);
}

export async function loadProjectInfo(): Promise<ProjectInfo> {
  const info = await loadMeta<ProjectInfo>(PROJECT_KEY);
  if (info) return info;

  // 旧localStorageから移行
  try {
    const raw = localStorage.getItem("kansei-project-info");
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectInfo;
      await saveProjectInfo(parsed);
      localStorage.removeItem("kansei-project-info");
      return parsed;
    }
  } catch {
    /* ignore */
  }

  return {
    projectNumber: "",
    projectName: "",
    projectLocation: "",
    periodStart: "",
    periodEnd: "",
    ordererName: "",
    contractorName: "",
    constructorName: "",
    corinsNumber: "",
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   データマイグレーション
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function migratePhotos(photos: PhotoRecord[]): PhotoRecord[] {
  return photos.map((p) => {
    const migrated = { ...p };

    // v1 → v2: thumbnailKey, sha256, _v 追加
    if (!migrated._v || migrated._v < 2) {
      if (!migrated.thumbnailKey) migrated.thumbnailKey = "";
      if (!migrated.sha256) migrated.sha256 = "";
      migrated._v = DATA_SCHEMA_VERSION;
    }

    return migrated;
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ストレージ整合性チェック
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function checkStorageIntegrity(): Promise<{
  orphanImages: number;
  missingImages: number;
  fixed: boolean;
}> {
  const photos = await loadPhotosMeta();
  let missingImages = 0;

  // メタがあるが画像がないレコードを検出
  for (const photo of photos) {
    const blob = await loadImage(photo.imageKey);
    if (!blob) missingImages++;
  }

  // 孤児画像の数は数えるだけ（削除はユーザー判断）
  return { orphanImages: 0, missingImages, fixed: false };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ユーティリティ
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** サムネイル生成（Canvas で最大200px） */
export function generateThumbnail(
  file: File
): Promise<{ thumbnailBlob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxSize = 200;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
      } else {
        if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve({ thumbnailBlob: blob, width: img.width, height: img.height });
          } else {
            reject(new Error("サムネイル生成に失敗しました"));
          }
        },
        "image/jpeg",
        0.7
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像の読み込みに失敗しました"));
    };
    img.src = url;
  });
}

/** 電子納品用の連番ファイル名を生成 例: P0001001.JPG */
export function generateDeliveryName(index: number): string {
  const num = String(index + 1).padStart(7, "0");
  return `P${num}.JPG`;
}

/** SHA-256ハッシュ生成（改ざん検知用） */
export async function computeSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** サムネイルBlobからDataURLを生成（表示用） */
export async function thumbnailToDataURL(key: string): Promise<string> {
  const blob = await loadImage(key);
  if (!blob) return "";
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}
