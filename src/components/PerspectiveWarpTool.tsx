import React, { useRef, useEffect, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface PerspectiveWarpToolProps {
  image: string;
  onWarpComplete: (warpedImage: string) => void;
}

const PerspectiveWarpTool: React.FC<PerspectiveWarpToolProps> = ({ image, onWarpComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImgObj(img);
    img.src = image;
  }, [image]);

  useEffect(() => {
    if (!canvasRef.current || !imgObj) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw original image as background
      ctx.globalAlpha = 0.8;
      ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;

      // Draw the warped area
      ctx.beginPath();
      ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
      ctx.lineTo(points[1].x * canvas.width, points[1].y * canvas.height);
      ctx.lineTo(points[2].x * canvas.width, points[2].y * canvas.height);
      ctx.lineTo(points[3].x * canvas.width, points[3].y * canvas.height);
      ctx.closePath();
      ctx.strokeStyle = '#0071e3';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 113, 227, 0.2)';
      ctx.fill();

      // Draw handles
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 10, 0, Math.PI * 2);
        ctx.fillStyle = draggingIdx === i ? '#0071e3' : '#fff';
        ctx.fill();
        ctx.strokeStyle = '#0071e3';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    };

    draw();
  }, [points, imgObj, draggingIdx]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;

    const idx = points.findIndex(p => Math.hypot(p.x - x, p.y - y) < 0.05);
    if (idx !== -1) setDraggingIdx(idx);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingIdx === null || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / canvas.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / canvas.height));

    const newPoints = [...points];
    newPoints[draggingIdx] = { x, y };
    setPoints(newPoints);
  };

  const handleMouseUp = () => setDraggingIdx(null);

  const captureWarp = () => {
    if (!canvasRef.current || !imgObj) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use a simplified perspective warp by drawing the image into the 4 points
    // For a real perspective warp, we'd need a matrix transform.
    // Here we'll just use the points to describe the warp to the AI.
    // But we need to return a "warped image" for the AI to see.
    
    // Use a white background for the captured warp
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the depth map
    ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);
    
    // Draw the warp boundary on top so the AI knows the target perspective
    ctx.beginPath();
    ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
    ctx.lineTo(points[1].x * canvas.width, points[1].y * canvas.height);
    ctx.lineTo(points[2].x * canvas.width, points[2].y * canvas.height);
    ctx.lineTo(points[3].x * canvas.width, points[3].y * canvas.height);
    ctx.closePath();
    ctx.strokeStyle = '#0071e3';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 113, 227, 0.3)';
    ctx.fill();

    onWarpComplete(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-square bg-[#F5F5F7] rounded-[32px] overflow-hidden shadow-inner border border-black/5">
        <canvas 
          ref={canvasRef}
          width={500}
          height={500}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full h-full cursor-crosshair"
        />
      </div>
      <button 
        onClick={captureWarp}
        className="w-full py-4 rounded-2xl bg-black text-white font-black text-[14px] hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
      >
        确认视角并重绘
      </button>
    </div>
  );
};

export default PerspectiveWarpTool;
