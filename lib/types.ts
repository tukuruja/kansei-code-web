/** データスキーマバージョン（マイグレーション用） */
export const DATA_SCHEMA_VERSION = 2;

/** 工事写真の分類区分（国交省デジタル写真管理情報基準準拠） */
export type PhotoCategory =
  | "着手前"
  | "施工状況"
  | "安全管理"
  | "使用材料"
  | "品質管理"
  | "出来形管理"
  | "災害"
  | "その他"
  | "完成";

/** 電子黒板データ */
export interface BlackboardData {
  工事名: string;
  工種: string;
  測点: string;
  撮影日: string;
  施工者名: string;
  備考: string;
}

/** 写真1枚のデータ */
export interface PhotoRecord {
  id: string;
  /** スキーマバージョン */
  _v: number;
  /** ファイル名（オリジナル） */
  originalName: string;
  /** 電子納品用連番ファイル名 例: P0001001.JPG */
  deliveryName: string;
  /** 分類区分 */
  category: PhotoCategory;
  /** 工種 */
  construction: string;
  /** 種別 */
  type: string;
  /** 細別 */
  detail: string;
  /** 写真タイトル */
  title: string;
  /** 撮影日 YYYY-MM-DD */
  shotDate: string;
  /** 撮影箇所 */
  location: string;
  /** 電子黒板データ */
  blackboard: BlackboardData;
  /** 黒板付き写真が生成済みか */
  hasBlackboardOverlay: boolean;
  /** 画像データキー（IndexedDB用） */
  imageKey: string;
  /** 黒板合成後の画像データキー（IndexedDB用） */
  overlayImageKey: string;
  /** サムネイルキー（IndexedDB用） */
  thumbnailKey: string;
  /** 幅px */
  width: number;
  /** 高さpx */
  height: number;
  /** ファイルサイズ bytes */
  fileSize: number;
  /** SHA-256ハッシュ（改ざん検知用） */
  sha256: string;
  /** 登録日時 ISO */
  createdAt: string;
  /** 更新日時 ISO */
  updatedAt: string;
}

/** 工事情報（電子納品INDEX用） */
export interface ProjectInfo {
  /** 工事番号 */
  projectNumber: string;
  /** 工事名称 */
  projectName: string;
  /** 工事箇所 */
  projectLocation: string;
  /** 工期開始 YYYY-MM-DD */
  periodStart: string;
  /** 工期終了 YYYY-MM-DD */
  periodEnd: string;
  /** 発注者名 */
  ordererName: string;
  /** 受注者名 */
  contractorName: string;
  /** 施工者名 */
  constructorName: string;
  /** CORINS登録番号 */
  corinsNumber: string;
}

/** 電子納品フォルダ内の1ファイル */
export interface DeliveryFile {
  path: string;
  name: string;
  type: "xml" | "jpg";
  data: Blob | string;
}

/** 写真管理基準の大分類 */
export const PHOTO_CATEGORIES: PhotoCategory[] = [
  "着手前",
  "施工状況",
  "安全管理",
  "使用材料",
  "品質管理",
  "出来形管理",
  "災害",
  "その他",
  "完成",
];

/** 電子納品フォルダ構成（国交省 工事完成図書の電子納品等要領） */
export const DELIVERY_FOLDER_STRUCTURE = {
  root: "DISK1",
  folders: [
    "PHOTO/PIC",
    "PHOTO/DRA",
    "DRAWINGF",
    "BORING/DATA",
    "BORING/LOG",
    "BORING/DRA",
    "ICON",
    "OTHRS/ORG",
  ],
} as const;

/** 電子納品必須フィールド */
export const DELIVERY_REQUIRED_FIELDS: (keyof ProjectInfo)[] = [
  "projectNumber",
  "projectName",
  "periodStart",
  "periodEnd",
  "ordererName",
  "contractorName",
  "constructorName",
];

/** 電子納品必須フィールドの日本語ラベル */
export const DELIVERY_FIELD_LABELS: Record<string, string> = {
  projectNumber: "工事番号",
  projectName: "工事名称",
  projectLocation: "工事箇所",
  periodStart: "工期開始",
  periodEnd: "工期終了",
  ordererName: "発注者名",
  contractorName: "受注者名",
  constructorName: "施工者名",
  corinsNumber: "CORINS登録番号",
};
