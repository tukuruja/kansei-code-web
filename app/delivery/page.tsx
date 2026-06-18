"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ProjectInfo, PhotoRecord } from "@/lib/types";
import { DELIVERY_FOLDER_STRUCTURE, DELIVERY_REQUIRED_FIELDS, DELIVERY_FIELD_LABELS } from "@/lib/types";
import { loadProjectInfo, saveProjectInfo, loadPhotosMeta, loadImage } from "@/lib/photo-store";
import { generatePhotoXML, generateIndexXML } from "@/lib/delivery-xml";
import { useToast } from "@/lib/toast";
import JSZip from "jszip";

const emptyProject: ProjectInfo = {
  projectNumber: "", projectName: "", projectLocation: "", periodStart: "", periodEnd: "",
  ordererName: "", contractorName: "", constructorName: "", corinsNumber: "",
};

export default function DeliveryPage() {
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(emptyProject);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [xmlPreview, setXmlPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // #16修正: debounce保存
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((info: ProjectInfo) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveProjectInfo(info); }, 500);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setProjectInfo(await loadProjectInfo());
        setPhotos(await loadPhotosMeta());
      } catch { toast("データの読み込みに失敗しました", "error"); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const updateProject = (field: keyof ProjectInfo, value: string) => {
    setProjectInfo((prev) => {
      const next = { ...prev, [field]: value };
      debouncedSave(next);
      return next;
    });
  };

  // #15修正: 必須フィールドバリデーション
  const validateProject = (): string[] => {
    const missing: string[] = [];
    for (const field of DELIVERY_REQUIRED_FIELDS) {
      if (!projectInfo[field].trim()) missing.push(DELIVERY_FIELD_LABELS[field] || field);
    }
    return missing;
  };

  const handlePreviewXML = () => {
    const missing = validateProject();
    if (missing.length > 0) { toast(`未入力: ${missing.join("、")}`, "warning"); return; }
    setXmlPreview(generatePhotoXML(photos, projectInfo));
  };

  // #11修正: streamFiles + 枚数警告
  const handleExportZip = async () => {
    if (photos.length === 0) { toast("写真が登録されていません", "warning"); return; }
    const missing = validateProject();
    if (missing.length > 0) { toast(`未入力: ${missing.join("、")}`, "warning"); return; }
    if (photos.length > 200 && !confirm(`写真${photos.length}枚のZIP生成は時間がかかります。続行しますか？`)) return;

    setGenerating(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(DELIVERY_FOLDER_STRUCTURE.root)!;
      for (const folder of DELIVERY_FOLDER_STRUCTURE.folders) root.folder(folder);

      setProgress("INDEX_C.XML を生成中...");
      root.file("INDEX_C.XML", generateIndexXML(projectInfo));

      setProgress("PHOTO.XML を生成中...");
      root.file("PHOTO/PHOTO.XML", generatePhotoXML(photos, projectInfo));

      let skipped = 0;
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        setProgress(`写真を格納中... ${i + 1}/${photos.length}`);
        const key = photo.hasBlackboardOverlay ? photo.overlayImageKey : photo.imageKey;
        const blob = await loadImage(key);
        if (blob) { root.file(`PHOTO/PIC/${photo.deliveryName}`, blob); }
        else { skipped++; }
      }

      setProgress("ZIPファイルを生成中...");
      const zipBlob = await zip.generateAsync({ type: "blob", streamFiles: true });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectInfo.projectName || "電子納品"}_DISK1.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (skipped > 0) toast(`${skipped}枚の画像が見つからずスキップしました`, "warning");
      else toast("ZIP出力が完了しました", "success");
    } catch (err) {
      toast(`エラー: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setGenerating(false); setProgress("");
    }
  };

  const projectFields: { key: keyof ProjectInfo; label: string; type?: string; placeholder: string; required?: boolean }[] = [
    { key: "projectNumber", label: "工事番号", placeholder: "例: 2026-A-001", required: true },
    { key: "projectName", label: "工事名称", placeholder: "例: 市道○○線舗装工事", required: true },
    { key: "projectLocation", label: "工事箇所", placeholder: "例: 神奈川県相模原市○○町" },
    { key: "periodStart", label: "工期開始", type: "date", placeholder: "", required: true },
    { key: "periodEnd", label: "工期終了", type: "date", placeholder: "", required: true },
    { key: "ordererName", label: "発注者名", placeholder: "例: 相模原市 建設局", required: true },
    { key: "contractorName", label: "受注者名", placeholder: "例: 相模建設株式会社", required: true },
    { key: "constructorName", label: "施工者名", placeholder: "例: 相模建設株式会社", required: true },
    { key: "corinsNumber", label: "CORINS登録番号", placeholder: "例: 1234567890" },
  ];

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400"><p className="text-lg">読み込み中...</p></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-2">電子納品</h1>
      <p className="text-gray-500 text-sm mb-6">国交省「工事完成図書の電子納品等要領」準拠のフォルダ構成・XMLを生成します</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold mb-4">工事情報</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projectFields.map((f) => (
                <div key={f.key} className={f.key === "projectName" || f.key === "projectLocation" ? "sm:col-span-2" : ""}>
                  <label className="block text-sm font-medium mb-1">
                    {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input type={f.type || "text"} value={projectInfo[f.key]} onChange={(e) => updateProject(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className={`w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-700 ${f.required && !projectInfo[f.key].trim() ? "border-red-300 dark:border-red-700" : "border-gray-300 dark:border-gray-600"}`} />
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold mb-4">納品対象写真（{photos.length}枚）</h2>
            {photos.length === 0 ? <p className="text-gray-400 text-sm">工事写真ページで写真を登録してください</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700"><tr>
                    <th className="px-3 py-2 text-left">納品名</th><th className="px-3 py-2 text-left">区分</th><th className="px-3 py-2 text-left">工種</th>
                    <th className="px-3 py-2 text-left">タイトル</th><th className="px-3 py-2 text-left">撮影日</th><th className="px-3 py-2 text-center">黒板</th><th className="px-3 py-2 text-center">検証</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {photos.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono text-xs">{p.deliveryName}</td>
                        <td className="px-3 py-2">{p.category}</td><td className="px-3 py-2">{p.construction}</td>
                        <td className="px-3 py-2">{p.title}</td><td className="px-3 py-2">{p.shotDate}</td>
                        <td className="px-3 py-2 text-center">{p.hasBlackboardOverlay ? <span className="text-green-600 font-bold">済</span> : <span className="text-gray-400">-</span>}</td>
                        <td className="px-3 py-2 text-center">{p.sha256 ? <span className="text-blue-600 font-bold">済</span> : <span className="text-gray-400">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold mb-4">フォルダ構成</h2>
            <div className="font-mono text-sm space-y-1">
              <FolderNode name={DELIVERY_FOLDER_STRUCTURE.root} level={0}>
                <FileNode name="INDEX_C.XML" level={1} type="xml" />
                <FolderNode name="PHOTO" level={1}>
                  <FileNode name="PHOTO.XML" level={2} type="xml" />
                  <FolderNode name="PIC" level={2}><FileNode name={`${photos.length}枚の写真`} level={3} type="jpg" /></FolderNode>
                  <FolderNode name="DRA" level={2} />
                </FolderNode>
                <FolderNode name="DRAWINGF" level={1} />
                <FolderNode name="BORING" level={1}><FolderNode name="DATA" level={2} /><FolderNode name="LOG" level={2} /><FolderNode name="DRA" level={2} /></FolderNode>
                <FolderNode name="ICON" level={1} />
                <FolderNode name="OTHRS" level={1}><FolderNode name="ORG" level={2} /></FolderNode>
              </FolderNode>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-bold mb-2">出力</h2>
            <button onClick={handlePreviewXML} disabled={photos.length === 0} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">PHOTO.XML プレビュー</button>
            <button onClick={handleExportZip} disabled={photos.length === 0 || generating} className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50">
              {generating ? progress || "生成中..." : "ZIP一括ダウンロード"}
            </button>
            <p className="text-xs text-gray-500">国交省「工事完成図書の電子納品等要領」<br />「デジタル写真管理情報基準」準拠</p>
          </section>
        </div>
      </div>

      {xmlPreview && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold">PHOTO.XML プレビュー</h2>
              <button onClick={() => setXmlPreview(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono bg-gray-50 dark:bg-gray-900 whitespace-pre-wrap">{xmlPreview}</pre>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => { navigator.clipboard.writeText(xmlPreview); toast("コピーしました", "success"); }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">コピー</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderNode({ name, level, children }: { name: string; level: number; children?: React.ReactNode }) {
  return (<div><div style={{ paddingLeft: `${level * 16}px` }} className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" /></svg>
    <span>{name}/</span></div>{children}</div>);
}

function FileNode({ name, level, type }: { name: string; level: number; type: "xml" | "jpg" }) {
  return (<div style={{ paddingLeft: `${level * 16}px` }} className="flex items-center gap-1">
    <span className={`text-[10px] px-1 rounded ${type === "xml" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"}`}>{type.toUpperCase()}</span>
    <span className="text-gray-600 dark:text-gray-400">{name}</span></div>);
}
