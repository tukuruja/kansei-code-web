import { useState, useRef, useEffect, useCallback } from "react";
import type { PhotoRecord, BlackboardData } from "@/lib/photo-types";
import { loadImage, saveImage, loadPhotosMeta, savePhotosMeta } from "@/lib/photo-store";
import { toast } from "sonner";

type Tool = "select" | "blackboard" | "eraser";
type BlackboardStyle = "green" | "white" | "blue";

const BB_STYLE_CONFIG: Record<BlackboardStyle, { bg: string; border: string; text: string; label: string }> = {
  green: { bg: "#1a3a1a", border: "#8b7355", text: "#ffffff", label: "クラシック緑" },
  white: { bg: "#ffffff", border: "#cccccc", text: "#333333", label: "ホワイト" },
  blue: { bg: "#1a2a4a", border: "#6688aa", text: "#ffffff", label: "ブルー" },
};

const WEATHER_OPTIONS = ["晴れ", "曇り", "雨", "雪", "晴れ時々曇り", "曇り時々雨"];

interface EditorProps {
  photo: PhotoRecord;
  onClose: () => void;
  onSaved: () => void;
}

export default function PhotoEditor({ photo, onClose, onSaved }: EditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [saving, setSaving] = useState(false);
  const [originalImg, setOriginalImg] = useState<ImageBitmap | null>(null);

  const [bbStyle, setBbStyle] = useState<BlackboardStyle>("green");
  const [bbData, setBbData] = useState<BlackboardData & { 天候: string }>({ ...photo.blackboard, 天候: "" });
  const [bbPos, setBbPos] = useState({ x: 0, y: 0 });
  const [bbSize, setBbSize] = useState({ w: 300, h: 180 });
  const [bbPlaced, setBbPlaced] = useState(false);

  const [eraserRadius, setEraserRadius] = useState(20);
  const [eraserMask, setEraserMask] = useState<ImageData | null>(null);
  const [eraserApplying, setEraserApplying] = useState(false);

  const [dragging, setDragging] = useState<"none" | "bb-move" | "bb-resize" | "eraser">("none");
  const dragStart = useRef({ x: 0, y: 0, bbX: 0, bbY: 0, bbW: 0, bbH: 0 });

  // 画像読み込み
  useEffect(() => {
    (async () => {
      const blob = await loadImage(photo.imageKey);
      if (!blob) { toast.error("元画像が見つかりません"); return; }
      const img = await createImageBitmap(blob);
      setOriginalImg(img);
      const canvas = canvasRef.current!;
      const overlay = overlayRef.current!;
      canvas.width = img.width; canvas.height = img.height;
      overlay.width = img.width; overlay.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const bw = Math.min(img.width * 0.35, 500);
      setBbSize({ w: bw, h: bw * 0.6 });
      setBbPos({ x: img.width - bw - 20, y: img.height - bw * 0.6 - 20 });
    })();
  }, [photo.imageKey]);

  // 黒板オーバーレイ描画
  const drawBlackboardOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !bbPlaced) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const style = BB_STYLE_CONFIG[bbStyle];
    const { x, y } = bbPos; const { w, h } = bbSize;

    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
    ctx.fillStyle = style.bg; ctx.fillRect(x, y, w, h);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = style.border; ctx.lineWidth = Math.max(w / 80, 3); ctx.strokeRect(x, y, w, h);

    // リサイズハンドルをCanvas上に描画
    const handleSize = Math.max(w / 12, 16);
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#ea580c"; ctx.lineWidth = 2;
    ctx.fillRect(x + w - handleSize, y + h - handleSize, handleSize, handleSize);
    ctx.strokeRect(x + w - handleSize, y + h - handleSize, handleSize, handleSize);

    const fontSize = Math.max(w / 18, 11);
    ctx.fillStyle = style.text;
    ctx.font = `bold ${fontSize}px "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif`;
    ctx.textBaseline = "top";
    const padding = w * 0.05; const lineH = fontSize * 1.5;
    const lines = [`工事名: ${bbData.工事名}`, `工種  : ${bbData.工種}`, `測点  : ${bbData.測点}`, `撮影日: ${bbData.撮影日}`, `天候  : ${bbData.天候}`, `施工者: ${bbData.施工者名}`];
    if (bbData.備考) lines.push(`備考  : ${bbData.備考}`);
    lines.forEach((line, i) => { ctx.fillText(line, x + padding, y + padding + i * lineH, w - padding * 2); });
  }, [bbPlaced, bbStyle, bbPos, bbSize, bbData]);

  useEffect(() => { drawBlackboardOverlay(); }, [drawBlackboardOverlay]);

  // 消しゴムマスク描画
  useEffect(() => {
    if (tool !== "eraser" || !eraserMask) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = eraserMask.width; maskCanvas.height = eraserMask.height;
    maskCanvas.getContext("2d")!.putImageData(eraserMask, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.globalAlpha = 0.4; ctx.drawImage(maskCanvas, 0, 0); ctx.globalAlpha = 1;
    if (bbPlaced) drawBlackboardOverlay();
  }, [tool, eraserMask, bbPlaced, drawBlackboardOverlay]);

  // タッチ＋マウス共通の座標変換
  const getCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { cx: number; cy: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ("touches" in e) {
      const touch = e.touches[0] || (e as TouchEvent).changedTouches?.[0];
      if (!touch) return null;
      clientX = touch.clientX; clientY = touch.clientY;
    } else {
      clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY;
    }
    return { cx: (clientX - rect.left) * (canvas.width / rect.width), cy: (clientY - rect.top) * (canvas.height / rect.height) };
  };

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoords(e);
    if (!coords) return;
    const { cx, cy } = coords;

    if (tool === "blackboard" && bbPlaced) {
      const handleSize = Math.max(bbSize.w / 12, 16);
      if (cx >= bbPos.x + bbSize.w - handleSize && cy >= bbPos.y + bbSize.h - handleSize && cx <= bbPos.x + bbSize.w && cy <= bbPos.y + bbSize.h) {
        setDragging("bb-resize"); dragStart.current = { x: cx, y: cy, bbX: bbPos.x, bbY: bbPos.y, bbW: bbSize.w, bbH: bbSize.h }; e.preventDefault(); return;
      }
      if (cx >= bbPos.x && cx <= bbPos.x + bbSize.w && cy >= bbPos.y && cy <= bbPos.y + bbSize.h) {
        setDragging("bb-move"); dragStart.current = { x: cx, y: cy, bbX: bbPos.x, bbY: bbPos.y, bbW: bbSize.w, bbH: bbSize.h }; e.preventDefault(); return;
      }
    }
    if (tool === "eraser") { setDragging("eraser"); paintMask(cx, cy); e.preventDefault(); }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (dragging === "none") return;
    const coords = getCoords(e);
    if (!coords) return;
    const { cx, cy } = coords;
    e.preventDefault();

    if (dragging === "bb-move") {
      setBbPos({ x: dragStart.current.bbX + cx - dragStart.current.x, y: dragStart.current.bbY + cy - dragStart.current.y });
    } else if (dragging === "bb-resize") {
      setBbSize({ w: Math.max(150, dragStart.current.bbW + cx - dragStart.current.x), h: Math.max(100, dragStart.current.bbH + cy - dragStart.current.y) });
    } else if (dragging === "eraser") {
      paintMask(cx, cy);
    }
  };

  const handleUp = () => { setDragging("none"); };

  const paintMask = (cx: number, cy: number) => {
    const canvas = canvasRef.current!;
    const w = canvas.width, h = canvas.height;
    setEraserMask((prev) => {
      const mask = prev || new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
      const data = mask.data; const r = eraserRadius;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = Math.round(cx + dx), py = Math.round(cy + dy);
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        const idx = (py * w + px) * 4;
        data[idx] = 255; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
      }
      return new ImageData(new Uint8ClampedArray(data), w, h);
    });
  };

  // マジック消しゴムをチャンク分割処理でUIフリーズ防止
  const applyMagicEraser = async () => {
    if (!eraserMask || !canvasRef.current) return;
    setEraserApplying(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;

    const result = new Uint8ClampedArray(imgData.data);
    const maskData = eraserMask.data;
    const isMasked = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (maskData[i * 4 + 3] > 0) isMasked[i] = 1;

    // 画像サイズに応じて反復回数を調整
    const totalPixels = w * h;
    const iterations = totalPixels > 8_000_000 ? 10 : totalPixels > 2_000_000 ? 20 : 30;

    for (let iter = 0; iter < iterations; iter++) {
      // UIスレッドを解放（フリーズ防止）
      await new Promise((r) => requestAnimationFrame(r));

      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!isMasked[idx]) continue;
        let rS = 0, gS = 0, bS = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nI = (ny * w + nx) * 4;
          rS += result[nI]; gS += result[nI + 1]; bS += result[nI + 2]; c++;
        }
        if (c > 0) { const pI = idx * 4; result[pI] = rS / c; result[pI + 1] = gS / c; result[pI + 2] = bS / c; result[pI + 3] = 255; }
      }
    }

    ctx.putImageData(new ImageData(result, w, h), 0, 0);
    setEraserMask(null);
    const overlay = overlayRef.current;
    if (overlay) { overlay.getContext("2d")!.clearRect(0, 0, overlay.width, overlay.height); if (bbPlaced) drawBlackboardOverlay(); }
    setEraserApplying(false);
    toast.success("消しゴムを適用しました");
  };

  // toBlob nullガード + 保存成功/失敗フィードバック
  const handleSave = async () => {
    setSaving(true);
    try {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      if (bbPlaced) ctx.drawImage(overlayRef.current!, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error("画像の生成に失敗しました。メモリ不足の可能性があります。")); }, "image/jpeg", 0.92);
      });

      const overlayKey = `overlay-${photo.id}`;
      await saveImage(overlayKey, blob);

      const updated: PhotoRecord = {
        ...photo,
        blackboard: { 工事名: bbData.工事名, 工種: bbData.工種, 測点: bbData.測点, 撮影日: bbData.撮影日, 施工者名: bbData.施工者名, 備考: bbData.備考 },
        hasBlackboardOverlay: true, overlayImageKey: overlayKey, updatedAt: new Date().toISOString(),
      };
      const allPhotos = (await loadPhotosMeta()).map((p) => p.id === photo.id ? updated : p);
      await savePhotosMeta(allPhotos);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!originalImg || !canvasRef.current) return;
    canvasRef.current.getContext("2d")!.drawImage(originalImg, 0, 0);
    setBbPlaced(false); setEraserMask(null);
    overlayRef.current?.getContext("2d")!.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    toast.info("元に戻しました");
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-700 rounded hover:bg-gray-600">戻る</button>
          <span className="text-sm text-gray-400 hidden sm:inline">{photo.title || photo.originalName}</span>
        </div>
        <div className="flex gap-1">
          <ToolBtn label="選択" active={tool === "select"} onClick={() => setTool("select")} />
          <ToolBtn label="黒板" active={tool === "blackboard"} onClick={() => setTool("blackboard")} />
          <ToolBtn label="消しゴム" active={tool === "eraser"} onClick={() => setTool("eraser")} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} className="px-3 py-1.5 text-sm bg-gray-700 rounded hover:bg-gray-600">元に戻す</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-sm bg-orange-600 rounded hover:bg-orange-700 font-medium disabled:opacity-50">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 bg-gray-800 text-white p-4 overflow-y-auto hidden md:block">
          {tool === "blackboard" && <BBPanel bbData={bbData} setBbData={setBbData} bbStyle={bbStyle} setBbStyle={setBbStyle} bbPlaced={bbPlaced}
            onPlace={() => setBbPlaced(true)} onRemove={() => { setBbPlaced(false); overlayRef.current?.getContext("2d")!.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height); }} />}
          {tool === "eraser" && <EraserPanel radius={eraserRadius} setRadius={setEraserRadius} hasMask={!!eraserMask} applying={eraserApplying}
            onApply={applyMagicEraser} onClear={() => { setEraserMask(null); overlayRef.current?.getContext("2d")!.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height); if (bbPlaced) drawBlackboardOverlay(); }} />}
          {tool === "select" && <div className="text-sm text-gray-400"><p className="font-bold text-white mb-2">ツールを選択</p><p><strong className="text-green-400">黒板</strong>：電子黒板を写真に配置。ドラッグで移動、右下ハンドルでリサイズ。</p><p className="mt-2"><strong className="text-red-400">消しゴム</strong>：ブラシで塗った範囲を周囲のピクセルで自動補完。</p></div>}
        </div>

        <div className="flex-1 overflow-auto bg-gray-950 flex items-center justify-center p-4">
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="max-w-full max-h-[calc(100vh-120px)] object-contain" />
            <canvas ref={overlayRef} className="absolute inset-0 max-w-full max-h-[calc(100vh-120px)] object-contain touch-none"
              style={{ cursor: tool === "eraser" ? "crosshair" : tool === "blackboard" && bbPlaced ? "move" : "default" }}
              onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
              onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp} onTouchCancel={handleUp}
            />
          </div>
        </div>

        {/* モバイル用下部パネル */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800 text-white p-3 max-h-[40vh] overflow-y-auto">
          {tool === "blackboard" && <BBPanel bbData={bbData} setBbData={setBbData} bbStyle={bbStyle} setBbStyle={setBbStyle} bbPlaced={bbPlaced}
            onPlace={() => setBbPlaced(true)} onRemove={() => { setBbPlaced(false); overlayRef.current?.getContext("2d")!.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height); }} />}
          {tool === "eraser" && <EraserPanel radius={eraserRadius} setRadius={setEraserRadius} hasMask={!!eraserMask} applying={eraserApplying}
            onApply={applyMagicEraser} onClear={() => { setEraserMask(null); overlayRef.current?.getContext("2d")!.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height); if (bbPlaced) drawBlackboardOverlay(); }} />}
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded text-sm transition-colors ${active ? "bg-orange-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{label}</button>;
}

function BBPanel({ bbData, setBbData, bbStyle, setBbStyle, bbPlaced, onPlace, onRemove }: {
  bbData: BlackboardData & { 天候: string }; setBbData: (fn: (p: BlackboardData & { 天候: string }) => BlackboardData & { 天候: string }) => void;
  bbStyle: BlackboardStyle; setBbStyle: (s: BlackboardStyle) => void; bbPlaced: boolean; onPlace: () => void; onRemove: () => void;
}) {
  const update = (k: string, v: string) => setBbData((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">電子黒板 / 後付黒板</h3>
      <div>
        <label className="block text-xs text-gray-400 mb-1">黒板スタイル</label>
        <div className="flex gap-2">
          {(Object.keys(BB_STYLE_CONFIG) as BlackboardStyle[]).map((k) => (
            <button key={k} onClick={() => setBbStyle(k)}
              className={`flex-1 py-2 rounded text-xs font-medium ${bbStyle === k ? "ring-2 ring-orange-500" : "opacity-60 hover:opacity-100"}`}
              style={{ background: BB_STYLE_CONFIG[k].bg, color: BB_STYLE_CONFIG[k].text, border: `2px solid ${BB_STYLE_CONFIG[k].border}` }}>
              {BB_STYLE_CONFIG[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {[{ k: "工事名", t: "text" }, { k: "工種", t: "text" }, { k: "測点", t: "text" }, { k: "撮影日", t: "date" }, { k: "施工者名", t: "text" }].map(({ k, t }) => (
          <div key={k}><label className="block text-xs text-gray-400">{k}</label>
            <input type={t} value={(bbData as unknown as Record<string, string>)[k] || ""} onChange={(e) => update(k, e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm" /></div>
        ))}
        <div><label className="block text-xs text-gray-400">天候</label>
          <select value={bbData.天候} onChange={(e) => update("天候", e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm">
            <option value="">選択してください</option>{WEATHER_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select></div>
        <div><label className="block text-xs text-gray-400">備考</label>
          <input type="text" value={bbData.備考} onChange={(e) => update("備考", e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm" /></div>
      </div>
      {!bbPlaced
        ? <button onClick={onPlace} className="w-full py-2 bg-green-700 rounded text-sm font-medium hover:bg-green-600">黒板を配置する</button>
        : <div className="space-y-2"><p className="text-xs text-green-400">黒板を配置済み -- ドラッグで移動、右下で拡縮</p>
            <button onClick={onRemove} className="w-full py-2 bg-red-800 rounded text-sm hover:bg-red-700">黒板を取り除く</button></div>}
    </div>
  );
}

function EraserPanel({ radius, setRadius, hasMask, applying, onApply, onClear }: {
  radius: number; setRadius: (r: number) => void; hasMask: boolean; applying: boolean; onApply: () => void; onClear: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">マジック消しゴム</h3>
      <p className="text-xs text-gray-400">消したい部分をブラシで塗ってください。赤い範囲が自動補完されます。</p>
      <div><label className="block text-xs text-gray-400 mb-1">ブラシサイズ: {radius}px</label>
        <input type="range" min={5} max={80} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" /></div>
      {hasMask && <div className="space-y-2">
        <button onClick={onApply} disabled={applying} className="w-full py-2 bg-red-600 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">{applying ? "適用中..." : "消しゴムを適用"}</button>
        <button onClick={onClear} className="w-full py-2 bg-gray-700 rounded text-sm hover:bg-gray-600">マスクをクリア</button>
      </div>}
    </div>
  );
}
