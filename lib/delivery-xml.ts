import type { PhotoRecord, ProjectInfo } from "./types";

/**
 * 国交省「デジタル写真管理情報基準」準拠
 * 写真管理ファイル PHOTO.XML を生成
 */
export function generatePhotoXML(
  photos: PhotoRecord[],
  projectInfo: ProjectInfo
): string {
  const now = new Date();
  const dateStr = formatDate(now);

  const photoEntries = photos
    .map(
      (p, i) => `    <写真情報>
      <シリアル番号>${i + 1}</シリアル番号>
      <写真ファイル情報>
        <写真ファイル名>PIC/${p.deliveryName}</写真ファイル名>
        <写真ファイル日本語名>${escapeXml(p.title)}</写真ファイル日本語名>
      </写真ファイル情報>
      <撮影箇所情報>
        <撮影箇所>${escapeXml(p.location)}</撮影箇所>
      </撮影箇所情報>
      <写真大分類>${escapeXml(p.category)}</写真大分類>
      <写真区分>${escapeXml(p.category)}</写真区分>
      <工種>${escapeXml(p.construction)}</工種>
      <種別>${escapeXml(p.type)}</種別>
      <細別>${escapeXml(p.detail)}</細別>
      <写真タイトル>${escapeXml(p.title)}</写真タイトル>
      <撮影年月日>${p.shotDate.replace(/-/g, "")}</撮影年月日>
      <代表写真>0</代表写真>
      <提出頻度写真>0</提出頻度写真>
    </写真情報>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<写真管理データ DTD_version="3.0">
  <基礎情報>
    <適用要領基準>土木202404-01</適用要領基準>
    <写真管理基準>デジタル写真管理情報基準 令和6年3月</写真管理基準>
    <写真フォルダ名>PHOTO</写真フォルダ名>
    <写真ファイルフォルダ名>PIC</写真ファイルフォルダ名>
    <参考図フォルダ名>DRA</参考図フォルダ名>
    <ソフトメーカ用TAG></ソフトメーカ用TAG>
  </基礎情報>
  <写真管理情報>
    <工事番号>${escapeXml(projectInfo.projectNumber)}</工事番号>
    <工事名称>${escapeXml(projectInfo.projectName)}</工事名称>
    <工事箇所>${escapeXml(projectInfo.projectLocation)}</工事箇所>
    <工期開始日>${projectInfo.periodStart.replace(/-/g, "")}</工期開始日>
    <工期終了日>${projectInfo.periodEnd.replace(/-/g, "")}</工期終了日>
    <施工者名>${escapeXml(projectInfo.constructorName)}</施工者名>
    <発注者名>${escapeXml(projectInfo.ordererName)}</発注者名>
    <作成日>${dateStr}</作成日>
${photoEntries}
  </写真管理情報>
</写真管理データ>`;
}

/**
 * 国交省「工事完成図書の電子納品等要領」準拠
 * 工事管理ファイル INDEX_C.XML を生成
 */
export function generateIndexXML(projectInfo: ProjectInfo): string {
  const now = new Date();
  const dateStr = formatDate(now);

  return `<?xml version="1.0" encoding="UTF-8"?>
<工事管理データ DTD_version="4.0">
  <基礎情報>
    <適用要領基準>土木202404-01</適用要領基準>
    <メディア番号>1</メディア番号>
    <メディア総枚数>1</メディア総枚数>
    <作成日>${dateStr}</作成日>
    <ソフトメーカ用TAG></ソフトメーカ用TAG>
  </基礎情報>
  <工事情報>
    <発注者機関コード></発注者機関コード>
    <発注者機関事務所名>${escapeXml(projectInfo.ordererName)}</発注者機関事務所名>
    <工事番号>${escapeXml(projectInfo.projectNumber)}</工事番号>
    <工事名称>${escapeXml(projectInfo.projectName)}</工事名称>
    <工事箇所>${escapeXml(projectInfo.projectLocation)}</工事箇所>
    <工期開始日>${projectInfo.periodStart.replace(/-/g, "")}</工期開始日>
    <工期終了日>${projectInfo.periodEnd.replace(/-/g, "")}</工期終了日>
    <CORINS登録番号>${escapeXml(projectInfo.corinsNumber)}</CORINS登録番号>
    <工事内容>
      <工種件名></工種件名>
    </工事内容>
    <発注者情報>
      <発注者名>${escapeXml(projectInfo.ordererName)}</発注者名>
    </発注者情報>
    <受注者情報>
      <受注者名>${escapeXml(projectInfo.contractorName)}</受注者名>
      <受注者コード></受注者コード>
    </受注者情報>
    <施工者情報>
      <施工者名>${escapeXml(projectInfo.constructorName)}</施工者名>
    </施工者情報>
    <予備></予備>
  </工事情報>
  <写真フォルダ情報>
    <写真フォルダ名>PHOTO</写真フォルダ名>
    <写真管理ファイル名>PHOTO.XML</写真管理ファイル名>
  </写真フォルダ情報>
</工事管理データ>`;
}

/** 日付を YYYYMMDD 形式にフォーマット */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** XML特殊文字をエスケープ */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
