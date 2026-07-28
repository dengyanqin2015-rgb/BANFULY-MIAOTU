import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Scissors, Trash2, Unlink2, X } from 'lucide-react';

type SliceLine = { id: string; axis: 'x' | 'y'; linked: boolean; positions: number[] };

interface Props {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (images: string[]) => void;
}

const evenPositions = (count: number) => Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));

export const ImageSliceEditor: React.FC<Props> = ({ imageUrl, onClose, onConfirm }) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [displayRect, setDisplayRect] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [vertical, setVertical] = useState<SliceLine[]>([]);
  const [horizontal, setHorizontal] = useState<SliceLine[]>([]);
  const [selected, setSelected] = useState<{ id: string; segment: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; segment: number } | null>(null);
  const [rowsInput, setRowsInput] = useState(2);
  const [colsInput, setColsInput] = useState(2);

  const rowCount = horizontal.length + 1;
  const colCount = vertical.length + 1;

  useEffect(() => {
    const updateDisplayRect = () => {
      const stage = stageRef.current;
      if (!stage || imageSize.width <= 1 || imageSize.height <= 1) return;
      const stageWidth = stage.clientWidth;
      const stageHeight = stage.clientHeight;
      const imageRatio = imageSize.width / imageSize.height;
      const stageRatio = stageWidth / Math.max(1, stageHeight);
      const width = stageRatio > imageRatio ? stageHeight * imageRatio : stageWidth;
      const height = stageRatio > imageRatio ? stageHeight : stageWidth / imageRatio;
      setDisplayRect({
        left: (stageWidth - width) / 2,
        top: (stageHeight - height) / 2,
        width,
        height
      });
    };
    updateDisplayRect();
    const observer = new ResizeObserver(updateDisplayRect);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [imageSize]);

  const normalizeSegments = (lines: SliceLine[], segments: number) =>
    lines.map(line => ({
      ...line,
      positions: Array.from({ length: segments }, (_, index) => line.positions[index] ?? line.positions[0] ?? 0.5)
    }));

  const setCounts = (rows: number, cols: number) => {
    const safeRows = Math.min(10, Math.max(1, Math.round(rows)));
    const safeCols = Math.min(10, Math.max(1, Math.round(cols)));
    const ys = evenPositions(Math.max(0, safeRows - 1));
    const xs = evenPositions(Math.max(0, safeCols - 1));
    setHorizontal(ys.map((position, index) => ({ id: `y-${Date.now()}-${index}`, axis: 'y', linked: true, positions: Array(safeCols).fill(position) })));
    setVertical(xs.map((position, index) => ({ id: `x-${Date.now()}-${index}`, axis: 'x', linked: true, positions: Array(safeRows).fill(position) })));
    setRowsInput(safeRows);
    setColsInput(safeCols);
    setSelected(null);
  };

  useEffect(() => {
    setVertical(lines => normalizeSegments(lines, rowCount));
  }, [rowCount]);

  useEffect(() => {
    setHorizontal(lines => normalizeSegments(lines, colCount));
  }, [colCount]);

  const detectLines = () => {
    const img = imageRef.current;
    if (!img?.naturalWidth || !img.naturalHeight) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const detectAxis = (axis: 'x' | 'y') => {
      const length = axis === 'x' ? canvas.width : canvas.height;
      const cross = axis === 'x' ? canvas.height : canvas.width;
      const scores: number[] = [];
      for (let p = 1; p < length; p++) {
        let boundaryEnergy = 0;
        for (let q = 0; q < cross; q += 2) {
          const x1 = axis === 'x' ? p : q;
          const y1 = axis === 'x' ? q : p;
          const x0 = axis === 'x' ? p - 1 : q;
          const y0 = axis === 'x' ? q : p - 1;
          const i1 = (y1 * canvas.width + x1) * 4;
          const i0 = (y0 * canvas.width + x0) * 4;
          boundaryEnergy += Math.abs(pixels[i1] - pixels[i0]) + Math.abs(pixels[i1 + 1] - pixels[i0 + 1]) + Math.abs(pixels[i1 + 2] - pixels[i0 + 2]);
        }
        scores[p] = boundaryEnergy / Math.max(1, cross);
      }
      const usableScores = scores.filter(Number.isFinite);
      const mean = usableScores.reduce((sum, value) => sum + value, 0) / Math.max(1, usableScores.length);
      let best = { count: 2, strength: -Infinity, positions: [] as number[] };
      for (let count = 2; count <= 6; count++) {
        const positions: number[] = [];
        let totalStrength = 0;
        for (let divider = 1; divider < count; divider++) {
          const expected = Math.round(length * divider / count);
          const radius = Math.max(3, Math.round(length * 0.025));
          let peakIndex = expected;
          let peakScore = -Infinity;
          for (let index = Math.max(1, expected - radius); index <= Math.min(length - 1, expected + radius); index++) {
            if ((scores[index] || 0) > peakScore) {
              peakScore = scores[index] || 0;
              peakIndex = index;
            }
          }
          positions.push(peakIndex / length);
          totalStrength += peakScore / Math.max(1, mean);
        }
        const strength = totalStrength / (count - 1) - count * 0.035;
        if (strength > best.strength) best = { count, strength, positions };
      }
      return best;
    };
    const xResult = detectAxis('x');
    const yResult = detectAxis('y');
    setColsInput(xResult.count);
    setRowsInput(yResult.count);
    setVertical(xResult.positions.map((position, index) => ({ id: `dx-${Date.now()}-${index}`, axis: 'x', linked: true, positions: Array(yResult.count).fill(position) })));
    setHorizontal(yResult.positions.map((position, index) => ({ id: `dy-${Date.now()}-${index}`, axis: 'y', linked: true, positions: Array(xResult.count).fill(position) })));
    setSelected(null);
  };

  const deleteSelectedLine = () => {
    if (!selected) return;
    const line = [...vertical, ...horizontal].find(item => item.id === selected.id);
    if (!line) return;
    if (line.axis === 'x') {
      setVertical(lines => lines.filter(item => item.id !== line.id));
      setColsInput(value => Math.max(1, value - 1));
    } else {
      setHorizontal(lines => lines.filter(item => item.id !== line.id));
      setRowsInput(value => Math.max(1, value - 1));
    }
    setSelected(null);
  };

  const addLine = (axis: 'x' | 'y') => {
    const lines = axis === 'x' ? vertical : horizontal;
    const sorted = [0, ...lines.map(line => line.positions[0]).sort((a, b) => a - b), 1];
    let bestStart = 0;
    let bestGap = 0;
    for (let index = 0; index < sorted.length - 1; index++) {
      const gap = sorted[index + 1] - sorted[index];
      if (gap > bestGap) {
        bestGap = gap;
        bestStart = sorted[index];
      }
    }
    const position = bestStart + bestGap / 2;
    if (axis === 'x') {
      setVertical(items => [...items, { id: `x-${Date.now()}`, axis, linked: true, positions: Array(rowCount).fill(position) }]);
      setColsInput(value => Math.min(10, value + 1));
    } else {
      setHorizontal(items => [...items, { id: `y-${Date.now()}`, axis, linked: true, positions: Array(colCount).fill(position) }]);
      setRowsInput(value => Math.min(10, value + 1));
    }
  };

  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault();
        deleteSelectedLine();
      }
    };
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  }, [selected, vertical, horizontal]);

  const xBounds = useMemo(() => [0, ...vertical.map(line => line.positions[0]).sort((a, b) => a - b), 1], [vertical]);
  const yBounds = useMemo(() => [0, ...horizontal.map(line => line.positions[0]).sort((a, b) => a - b), 1], [horizontal]);

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const line = [...vertical, ...horizontal].find(item => item.id === dragging.id);
    if (!line) return;
    const raw = line.axis === 'x' ? (event.clientX - bounds.left) / bounds.width : (event.clientY - bounds.top) / bounds.height;
    const value = Math.min(0.98, Math.max(0.02, raw));
    const setter = line.axis === 'x' ? setVertical : setHorizontal;
    setter(lines => lines.map(item => item.id !== line.id ? item : {
      ...item,
      positions: item.linked ? item.positions.map(() => value) : item.positions.map((old, index) => index === dragging.segment ? value : old)
    }));
  };

  const crop = () => {
    const img = imageRef.current;
    if (!img) return;
    const output: string[] = [];
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < colCount; col++) {
        const left = col === 0 ? 0 : vertical[col - 1]?.positions[row] ?? xBounds[col];
        const right = col === colCount - 1 ? 1 : vertical[col]?.positions[row] ?? xBounds[col + 1];
        const top = row === 0 ? 0 : horizontal[row - 1]?.positions[col] ?? yBounds[row];
        const bottom = row === rowCount - 1 ? 1 : horizontal[row]?.positions[col] ?? yBounds[row + 1];
        const sx = Math.round(Math.min(left, right) * img.naturalWidth);
        const sy = Math.round(Math.min(top, bottom) * img.naturalHeight);
        const sw = Math.max(1, Math.round(Math.abs(right - left) * img.naturalWidth));
        const sh = Math.max(1, Math.round(Math.abs(bottom - top) * img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        canvas.getContext('2d')?.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        output.push(canvas.toDataURL('image/png'));
      }
    }
    onConfirm(output);
  };

  const selectedLine = selected ? [...vertical, ...horizontal].find(line => line.id === selected.id) : undefined;

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/65 p-4 text-white" onClick={onClose}>
      <div className="flex h-[min(780px,88vh)] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101010] shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex min-h-16 items-center gap-4 border-b border-white/10 px-5">
        <div className="shrink-0"><div className="font-bold">一键裁剪 · 宫格切片</div><div className="text-[10px] text-gray-500">拖动浅蓝色分界线；取消联动后可单独拖动某一段</div></div>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2">
          <button onClick={detectLines} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold">自动识别</button>
          {[[3, 3], [2, 2], [5, 2], [2, 5], [3, 2], [2, 3]].map(([cols, rows]) => (
            <button key={`${cols}x${rows}`} onClick={() => setCounts(rows, cols)} className="rounded-lg bg-white/10 px-2.5 py-2 text-xs">{cols}×{rows}</button>
          ))}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1" title="横向格数 × 纵向格数">
            <input aria-label="横向格数" type="number" min={1} max={10} value={colsInput} onChange={event => setColsInput(Number(event.target.value))} className="w-9 bg-transparent text-center text-xs outline-none" />
            <span className="text-gray-500">×</span>
            <input aria-label="纵向格数" type="number" min={1} max={10} value={rowsInput} onChange={event => setRowsInput(Number(event.target.value))} className="w-9 bg-transparent text-center text-xs outline-none" />
            <button onClick={() => setCounts(rowsInput, colsInput)} className="ml-1 rounded bg-white/10 px-2 py-1 text-[10px] font-bold">应用</button>
          </div>
          <button onClick={() => addLine('x')} className="rounded-lg bg-white/10 px-2.5 py-2 text-xs">+竖线</button>
          <button onClick={() => addLine('y')} className="rounded-lg bg-white/10 px-2.5 py-2 text-xs">+横线</button>
          {selectedLine && <button onClick={() => {
            const setter = selectedLine.axis === 'x' ? setVertical : setHorizontal;
            setter(lines => lines.map(line => line.id === selectedLine.id ? { ...line, linked: !line.linked } : line));
          }} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold">
            {selectedLine.linked ? <Link2 size={14} /> : <Unlink2 size={14} />}{selectedLine.linked ? '整线联动' : '单段移动'}
          </button>}
          {selectedLine && <button onClick={deleteSelectedLine} className="flex items-center gap-1 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300"><Trash2 size={14} />删除线</button>}
          <button onClick={crop} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold"><Scissors size={15} />确认裁剪（{rowCount * colCount}张）</button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white"><X /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-6">
        <div
          ref={stageRef}
          className="relative mx-auto h-full w-full select-none"
          onPointerMove={updateDrag}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
        >
          <img ref={imageRef} src={imageUrl} onLoad={e => setImageSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} className="pointer-events-none h-full w-full object-contain" alt="slice target" />
          <div
            ref={overlayRef}
            className="absolute overflow-hidden"
            style={{ left: displayRect.left, top: displayRect.top, width: displayRect.width, height: displayRect.height }}
          >
            {vertical.flatMap(line => line.positions.map((position, segment) => {
              const top = yBounds[segment] ?? 0; const bottom = yBounds[segment + 1] ?? 1;
              return <div key={`${line.id}-${segment}`} onPointerDown={e => { e.stopPropagation(); setSelected({ id: line.id, segment }); setDragging({ id: line.id, segment }); e.currentTarget.setPointerCapture(e.pointerId); }} className="absolute w-px -translate-x-1/2 cursor-ew-resize bg-sky-300 shadow-[0_0_4px_rgba(125,211,252,0.8)]" style={{ left: `${position * 100}%`, top: `${top * 100}%`, height: `${(bottom - top) * 100}%` }} />;
            }))}
            {horizontal.flatMap(line => line.positions.map((position, segment) => {
              const left = xBounds[segment] ?? 0; const right = xBounds[segment + 1] ?? 1;
              return <div key={`${line.id}-${segment}`} onPointerDown={e => { e.stopPropagation(); setSelected({ id: line.id, segment }); setDragging({ id: line.id, segment }); e.currentTarget.setPointerCapture(e.pointerId); }} className="absolute h-px -translate-y-1/2 cursor-ns-resize bg-sky-300 shadow-[0_0_4px_rgba(125,211,252,0.8)]" style={{ top: `${position * 100}%`, left: `${left * 100}%`, width: `${(right - left) * 100}%` }} />;
            }))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
