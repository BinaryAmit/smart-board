"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import { addPage, getBoard, updatePageDrawing, uploadBoardPdf } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-storage";
import { BoardDetail, Page, User } from "@/lib/types";

// Keep worker version aligned with installed pdfjs-dist to avoid runtime render failures.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Tool = "draw" | "highlight" | "erase" | "pan" | "rect" | "circle" | "line" | "arrow";

type Props = {
  boardId: string;
  user: User;
};

type DrawingPayload = {
  dataUrl?: string;
};

function normalizePdfUrl(url: string) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const mediaIndex = parsed.pathname.indexOf("/media/");

    // Handle previously saved malformed URLs like /api/.../upload-pdf/media/pdfs/...
    if (mediaIndex > 0) {
      const mediaPath = parsed.pathname.slice(mediaIndex);
      return `${parsed.origin}${mediaPath}`;
    }

    return url;
  } catch {
    return url;
  }
}

export default function SmartBoard({ boardId, user }: Props) {
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#ff0000");
  const [brush, setBrush] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [timeText, setTimeText] = useState("");
  const [dateText, setDateText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentPageIdRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeRenderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const renderRequestIdRef = useRef(0);

  const canEdit = useMemo(() => {
    if (!board) return false;
    if (board.owner.id === user.id) return true;
    const member = board.memberships.find((m) => m.user.id === user.id);
    return member?.role === "editor";
  }, [board, user.id]);

  const page = board?.pages[currentIndex] ?? null;

  useEffect(() => {
    currentPageIdRef.current = page?.id ?? null;
  }, [page?.id]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    loadBoard();
    const poll = window.setInterval(loadBoard, 20000);
    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api";
    const root = apiBase.replace(/\/api\/?$/, "");
    const wsBase = root.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/ws/boards/${boardId}/?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data) as { event?: string; payload?: { page_id?: number } };
        const event = data.event;
        if (!event || event === "connected") return;

        // Ignore our own in-flight drawing updates to prevent flicker.
        if (
          event === "drawing_updated" &&
          currentPageIdRef.current &&
          data.payload?.page_id === currentPageIdRef.current &&
          isSavingRef.current
        ) {
          return;
        }

        void loadBoard();
      } catch {
        // Ignore malformed socket messages.
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setTimeText(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      setDateText(now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }));
    };

    updateDateTime();
    const timer = window.setInterval(updateDateTime, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    renderCurrentPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, zoom, panX, panY]);

  useEffect(() => {
    const listener = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);

  useEffect(() => {
    const updateCompact = () => {
      setIsCompact(window.innerWidth < 900);
    };

    updateCompact();
    window.addEventListener("resize", updateCompact);
    return () => window.removeEventListener("resize", updateCompact);
  }, []);

  useEffect(() => {
    return () => {
      try {
        activeRenderTaskRef.current?.cancel();
      } catch {
        // Ignore cancellation failures during teardown.
      }
    };
  }, []);

  async function loadBoard() {
    try {
      const data = await getBoard(boardId);
      setBoard((prev) => {
        if (!prev) return data;
        const samePage = prev.pages[currentIndex];
        if (!samePage) return data;

        const mapped = data.pages.map((nextPage) => {
          if (nextPage.id !== samePage.id) return nextPage;
          return {
            ...nextPage,
            drawing_data:
              (samePage.drawing_data as DrawingPayload)?.dataUrl && drawingRef.current
                ? samePage.drawing_data
                : nextPage.drawing_data,
          };
        });

        return { ...data, pages: mapped };
      });

      setCurrentIndex((idx) => {
        if (data.pages.length === 0) return 0;
        return Math.min(idx, data.pages.length - 1);
      });
    } catch {
      setError("Could not load board.");
    }
  }

  async function renderCurrentPage() {
    const pdfCanvas = pdfCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const viewer = viewerRef.current;
    if (!pdfCanvas || !drawCanvas || !viewer || !page) return;

    const renderId = ++renderRequestIdRef.current;
    if (activeRenderTaskRef.current) {
      try {
        activeRenderTaskRef.current.cancel();
      } catch {
        // Ignore errors while cancelling previous render task.
      }
      activeRenderTaskRef.current = null;
    }

    const pdfCtx = pdfCanvas.getContext("2d");
    const drawCtx = drawCanvas.getContext("2d");
    if (!pdfCtx || !drawCtx) return;

    const stageWidth = Math.max(320, window.innerWidth - railWidth * 2 - 24);
    const stageHeight = Math.max(240, window.innerHeight - footerHeight - 24);

    if (page.page_type === "pdf" && page.pdf_source_url) {
      try {
        setError(null);
        const doc = await pdfjs.getDocument({ url: normalizePdfUrl(page.pdf_source_url) }).promise;
        if (renderId !== renderRequestIdRef.current) {
          return;
        }

        const p = await doc.getPage(page.pdf_page_number || 1);
        if (renderId !== renderRequestIdRef.current) {
          return;
        }

        const baseViewport = p.getViewport({ scale: 1 });
        const fitScale = Math.min(stageWidth / baseViewport.width, stageHeight / baseViewport.height) * 0.98;
        const viewport = p.getViewport({ scale: Math.max(0.2, fitScale) });
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        drawCanvas.width = viewport.width;
        drawCanvas.height = viewport.height;

        const renderTask = p.render({ canvasContext: pdfCtx, viewport });
        activeRenderTaskRef.current = renderTask;

        try {
          await renderTask.promise;
        } finally {
          if (activeRenderTaskRef.current === renderTask) {
            activeRenderTaskRef.current = null;
          }
        }
      } catch (err) {
        if (err && typeof err === "object" && "name" in err && err.name === "RenderingCancelledException") {
          return;
        }

        const message = err instanceof Error ? err.message : "Unable to render PDF page.";
        setError(`PDF render failed: ${message}`);
        pdfCanvas.width = stageWidth;
        pdfCanvas.height = stageHeight;
        drawCanvas.width = stageWidth;
        drawCanvas.height = stageHeight;
        pdfCtx.fillStyle = "#ffffff";
        pdfCtx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);
      }
    } else {
      setError(null);
      pdfCanvas.width = stageWidth;
      pdfCanvas.height = stageHeight;
      drawCanvas.width = stageWidth;
      drawCanvas.height = stageHeight;
      pdfCtx.fillStyle = "#ffffff";
      pdfCtx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    }

    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    const dataUrl = (page.drawing_data as DrawingPayload)?.dataUrl;
    if (dataUrl) {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => drawCtx.drawImage(img, 0, 0);
    }

    viewer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function getDrawContext() {
    const drawCanvas = drawCanvasRef.current;
    return drawCanvas?.getContext("2d") ?? null;
  }

  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function saveState() {
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    undoRef.current.push(drawCanvas.toDataURL());
    redoRef.current = [];
  }

  function drawStart(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canEdit) return;

    const { x, y } = pointerPos(e);
    if (tool === "pan") {
      panningRef.current = true;
      startRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const ctx = getDrawContext();
    if (!ctx) return;

    saveState();
    drawingRef.current = true;
    startRef.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function drawMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (panningRef.current) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      setPanX((v) => v + dx);
      setPanY((v) => v + dy);
      startRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!drawingRef.current) return;
    const ctx = getDrawContext();
    if (!ctx) return;

    const { x, y } = pointerPos(e);

    if (tool === "draw" || tool === "highlight" || tool === "erase") {
      ctx.lineCap = "round";
      if (tool === "highlight") {
        ctx.lineWidth = brush * 7;
        ctx.globalAlpha = 0.06;
      } else {
        ctx.lineWidth = brush;
        ctx.globalAlpha = 1;
      }

      if (tool === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = brush * 11;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
      }

      ctx.lineTo(x, y);
      ctx.stroke();
      startRef.current = { x, y };
    }
  }

  function drawEnd(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (panningRef.current) {
      panningRef.current = false;
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;

    const ctx = getDrawContext();
    if (!ctx) return;

    const { x, y } = pointerPos(e);
    const { x: sx, y: sy } = startRef.current;

    ctx.strokeStyle = color;
    ctx.lineWidth = brush;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (tool === "rect") {
      ctx.strokeRect(sx, sy, x - sx, y - sy);
    } else if (tool === "circle") {
      const d = Math.hypot(x - sx, y - sy);
      const r = d / 2;
      const centerX = (sx + x) / 2;
      const centerY = (sy + y) / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === "arrow") {
      const headLen = 15;
      const dx = x - sx;
      const dy = y - sy;
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x, y);
      ctx.moveTo(x - headLen * Math.cos(angle - Math.PI / 6), y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x, y);
      ctx.lineTo(x - headLen * Math.cos(angle + Math.PI / 6), y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    scheduleSave();
  }

  function undo() {
    const drawCanvas = drawCanvasRef.current;
    const ctx = getDrawContext();
    if (!drawCanvas || !ctx || undoRef.current.length === 0) return;

    redoRef.current.push(drawCanvas.toDataURL());
    const image = new Image();
    image.src = undoRef.current.pop()!;
    image.onload = () => {
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx.drawImage(image, 0, 0);
      scheduleSave();
    };
  }

  function redo() {
    const drawCanvas = drawCanvasRef.current;
    const ctx = getDrawContext();
    if (!drawCanvas || !ctx || redoRef.current.length === 0) return;

    undoRef.current.push(drawCanvas.toDataURL());
    const image = new Image();
    image.src = redoRef.current.pop()!;
    image.onload = () => {
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx.drawImage(image, 0, 0);
      scheduleSave();
    };
  }

  function clearCanvas() {
    const drawCanvas = drawCanvasRef.current;
    const ctx = getDrawContext();
    if (!drawCanvas || !ctx) return;
    saveState();
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    scheduleSave();
  }

  function scheduleSave() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persistDrawing();
    }, 500);
  }

  async function persistDrawing() {
    if (!page) return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;

    const dataUrl = drawCanvas.toDataURL();

    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p) => (p.id === page.id ? { ...p, drawing_data: { dataUrl } } : p)),
      };
    });

    setIsSaving(true);
    try {
      await updatePageDrawing(page.id, { dataUrl });
    } catch {
      setError("Save failed for this page.");
    } finally {
      setIsSaving(false);
    }
  }

  async function nextPage() {
    if (!board) return;

    if (canEdit) {
      await persistDrawing();
    }

    if (currentIndex >= board.pages.length - 1) {
      if (!canEdit) return;

      const newPage = await addPage(board.id, {
        order: board.pages.length,
        page_type: "blank",
        drawing_data: {},
      });
      setBoard({ ...board, pages: [...board.pages, newPage] });
      setCurrentIndex(currentIndex + 1);
      return;
    }

    setCurrentIndex((i) => i + 1);
  }

  async function prevPage() {
    if (currentIndex <= 0) return;
    if (canEdit) {
      await persistDrawing();
    }
    setCurrentIndex((i) => i - 1);
  }

  async function addBlankPage() {
    if (!board || !canEdit) return;
    await persistDrawing();

    const newPage = await addPage(board.id, {
      order: board.pages.length,
      page_type: "blank",
      drawing_data: {},
    });

    setBoard({ ...board, pages: [...board.pages, newPage] });
    setCurrentIndex(board.pages.length);
  }

  async function loadPdfByUrl() {
    if (!board || !canEdit) return;

    const url = window.prompt("Enter public PDF URL");
    if (!url) return;

    try {
      const doc = await pdfjs.getDocument(url).promise;
      const created: Page[] = [];

      for (let i = 1; i <= doc.numPages; i += 1) {
        // Add each PDF page as a board page for shared, multi-user access.
        const page = await addPage(board.id, {
          order: board.pages.length + created.length,
          page_type: "pdf",
          pdf_page_number: i,
          pdf_source_url: url,
          drawing_data: {},
        });
        created.push(page);
      }

      setBoard({ ...board, pages: [...board.pages, ...created] });
      if (created.length > 0) setCurrentIndex(board.pages.length);
    } catch {
      setError("Unable to load PDF from that URL.");
    }
  }

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !board || !canEdit) return;

    setError(null);
    setIsUploading(true);
    try {
      let allCreated: Page[] = [];

      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          continue;
        }

        const created = await uploadBoardPdf(board.id, file);
        allCreated = allCreated.concat(created);
      }

      if (allCreated.length > 0) {
        const firstNewPageIndex = board.pages.length;
        setBoard((prev) => {
          if (!prev) return prev;
          return { ...prev, pages: [...prev.pages, ...allCreated] };
        });
        setCurrentIndex(firstNewPageIndex);
      } else {
        setError("Please choose at least one PDF file.");
      }
    } catch {
      setError("Upload failed. Please use a valid PDF.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  function fit() {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }

  const railWidth = isCompact ? 44 : 56;
  const footerHeight = isCompact ? 56 : 62;
  const toolButtonSize = isCompact ? 34 : 38;

  const toolButtonStyle = (active = false): CSSProperties => ({
    width: toolButtonSize,
    height: toolButtonSize,
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 10,
    background: active
      ? "linear-gradient(140deg, #ffd479 0%, #f2aa4c 100%)"
      : "linear-gradient(140deg, rgba(114,153,176,0.45) 0%, rgba(56,89,111,0.68) 100%)",
    color: active ? "#11202d" : "#f4fbff",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease",
    boxShadow: active ? "0 6px 16px rgba(242,170,76,0.32)" : "0 4px 14px rgba(0,0,0,0.28)",
  });

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        color: "white",
        background:
          "radial-gradient(circle at 20% 20%, #23435a 0%, #102234 35%, #091523 62%, #08111d 100%)",
      }}
    >
      <div style={barLeft(railWidth)}>
        <button style={toolButtonStyle(false)} onClick={loadPdfByUrl} title="Load PDF URL" disabled={!canEdit}>
          PDF
        </button>
        <button
          style={toolButtonStyle(false)}
          onClick={() => fileInputRef.current?.click()}
          title="Upload PDF File"
          disabled={!canEdit}
        >
          ⭱
        </button>
        <button style={toolButtonStyle(tool === "draw")} onClick={() => setTool("draw")}>
          ✏
        </button>
        <button style={toolButtonStyle(tool === "highlight")} onClick={() => setTool("highlight")}>
          🖍
        </button>
        <button style={toolButtonStyle(tool === "erase")} onClick={() => setTool("erase")}>
          🧽
        </button>
        <button style={toolButtonStyle(tool === "pan")} onClick={() => setTool("pan")}>
          ✋
        </button>
        <button style={toolButtonStyle(false)} onClick={undo}>
          ↩
        </button>
        <button style={toolButtonStyle(false)} onClick={redo}>
          ↪
        </button>
        <button style={toolButtonStyle(false)} onClick={clearCanvas}>
          ❌
        </button>
      </div>

      <div style={barRight(railWidth)}>
        <button style={toolButtonStyle(tool === "rect")} onClick={() => setTool("rect")}>
          ▭
        </button>
        <button style={toolButtonStyle(tool === "circle")} onClick={() => setTool("circle")}>
          ◯
        </button>
        <button style={toolButtonStyle(tool === "line")} onClick={() => setTool("line")}>
          ／
        </button>
        <button style={toolButtonStyle(tool === "arrow")} onClick={() => setTool("arrow")}>
          →
        </button>
        <button style={toolButtonStyle(false)} onClick={toggleFullscreen}>
          {isFullscreen ? "⬚" : "⛶"}
        </button>
        <button style={toolButtonStyle(false)} onClick={addBlankPage} disabled={!canEdit}>
          ➕
        </button>
        <button style={toolButtonStyle(false)} onClick={() => setZoom((z) => z + 0.1)}>
          ＋
        </button>
        <button style={toolButtonStyle(false)} onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>
          －
        </button>
        <button style={toolButtonStyle(false)} onClick={fit}>
          ⤢
        </button>
      </div>

      <div style={bottomBar(railWidth, footerHeight, isCompact)}>
        <button style={toolButtonStyle(false)} onClick={() => void prevPage()}>
          ◀
        </button>
        <span style={{ minWidth: isCompact ? 96 : 150, textAlign: "center", fontWeight: 600, letterSpacing: 0.3 }}>
          Page {board ? currentIndex + 1 : 0} / {board?.pages.length ?? 0}
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canEdit || isUploading}
          style={{ ...toolButtonStyle(false), width: "auto", padding: "0 12px", minWidth: isCompact ? 86 : 110 }}
        >
          {isUploading ? "Uploading" : "Upload PDF"}
        </button>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: isCompact ? 34 : 40, height: isCompact ? 34 : 38, border: "none", background: "transparent" }}
        />
        <input
          type="range"
          min={1}
          max={30}
          value={brush}
          onChange={(e) => setBrush(Number(e.target.value))}
          style={{ width: isCompact ? 88 : 130 }}
        />
        <button
          style={toolButtonStyle(false)}
          onClick={() => void nextPage()}
          disabled={!canEdit && currentIndex >= (board?.pages.length ?? 1) - 1}
        >
          ▶
        </button>
      </div>

      <div style={boardWrap(railWidth, footerHeight)}>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={onUploadFile}
          style={{ display: "none" }}
        />
        <div
          ref={viewerRef}
          style={{
            position: "relative",
            transformOrigin: "center center",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <canvas ref={pdfCanvasRef} />
          <canvas
            ref={drawCanvasRef}
            style={{ position: "absolute", left: 0, top: 0, touchAction: "none" }}
            onPointerDown={drawStart}
            onPointerMove={drawMove}
            onPointerUp={drawEnd}
            onPointerLeave={drawEnd}
          />
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          top: 10,
          right: railWidth + 10,
          fontSize: isCompact ? 26 : 38,
          fontFamily: "monospace",
          textShadow: "0 2px 8px rgba(0,0,0,0.55)",
          fontWeight: 700,
          letterSpacing: 1,
          zIndex: 40,
        }}
      >
        {timeText}
      </div>
      <div
        style={{
          position: "fixed",
          right: railWidth + 10,
          bottom: footerHeight + 8,
          fontSize: isCompact ? 16 : 22,
          textShadow: "0 2px 8px rgba(0,0,0,0.55)",
          zIndex: 40,
        }}
      >
        {dateText}
      </div>
      <div
        style={{
          position: "fixed",
          top: 12,
          left: railWidth + 10,
          color: "#f9bf69",
          fontSize: isCompact ? 12 : 14,
          background: "rgba(9,20,30,0.7)",
          border: "1px solid rgba(242,170,76,0.3)",
          borderRadius: 8,
          padding: "6px 10px",
          zIndex: 40,
        }}
      >
        {board?.title ?? "Loading board..."} {isSaving ? "(saving...)" : ""} {isUploading ? "(uploading...)" : ""} {canEdit ? "" : "(view-only)"}
      </div>
      {error && (
        <div
          style={{
            position: "fixed",
            top: 54,
            left: railWidth + 10,
            color: "#ffb2a9",
            fontSize: 13,
            background: "rgba(70,10,10,0.52)",
            border: "1px solid rgba(255,120,120,0.45)",
            borderRadius: 8,
            padding: "6px 10px",
            maxWidth: "70vw",
            zIndex: 45,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const barLeft = (railWidth: number): CSSProperties => ({
  position: "fixed",
  left: 0,
  top: 0,
  width: railWidth,
  height: "100%",
  background: "linear-gradient(180deg, rgba(37,63,82,0.95) 0%, rgba(22,42,58,0.95) 100%)",
  borderRight: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(8px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 6,
  zIndex: 30,
});

const barRight = (railWidth: number): CSSProperties => ({
  position: "fixed",
  right: 0,
  top: 0,
  width: railWidth,
  height: "100%",
  background: "linear-gradient(180deg, rgba(37,63,82,0.95) 0%, rgba(22,42,58,0.95) 100%)",
  borderLeft: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(8px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 6,
  zIndex: 30,
});

const bottomBar = (railWidth: number, footerHeight: number, isCompact: boolean): CSSProperties => ({
  position: "fixed",
  bottom: 0,
  left: railWidth,
  right: railWidth,
  height: footerHeight,
  background: "linear-gradient(180deg, rgba(32,57,75,0.96) 0%, rgba(20,39,54,0.96) 100%)",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: isCompact ? 6 : 10,
  padding: isCompact ? "6px" : "8px 12px",
  backdropFilter: "blur(8px)",
  zIndex: 30,
});

const boardWrap = (railWidth: number, footerHeight: number): CSSProperties => ({
  position: "absolute",
  left: railWidth,
  right: railWidth,
  top: 0,
  bottom: footerHeight,
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
});
