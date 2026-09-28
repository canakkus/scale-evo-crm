"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
} from "lucide-react";

export type LeadAttachmentItem = {
  id: string;
  leadId: string;
  url: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  createdAt: string | Date;
};

type LeadAttachmentsProps = {
  leadId: string;
  attachments?: LeadAttachmentItem[];
  onUpdate?: () => void;
};

export function LeadAttachments({
  leadId,
  attachments = [],
  onUpdate,
}: LeadAttachmentsProps) {
  const [items, setItems] = useState<LeadAttachmentItem[]>(attachments);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightbox State
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(attachments);
  }, [attachments]);

  // Upload handler
  const handleUploadFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (validFiles.length === 0) {
      setError("Bitte nur Bilddateien (PNG, JPG, WebP) hochladen.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    validFiles.forEach((file) => formData.append("files", file));

    try {
      const res = await fetch(`/api/leads/${leadId}/attachments`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Upload.");
      }

      if (data.attachments) {
        setItems((prev) => [...data.attachments, ...prev]);
        if (onUpdate) onUpdate();
      }
    } catch (err: any) {
      setError(err?.message || "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  // Delete handler
  const handleDelete = async (e: React.MouseEvent, attachmentId: string) => {
    e.stopPropagation();
    if (!confirm("Diesen Screenshot wirklich entfernen?")) return;

    try {
      const res = await fetch(
        `/api/leads/${leadId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== attachmentId));
        if (activeImageIndex !== null) {
          closeLightbox();
        }
        if (onUpdate) onUpdate();
      }
    } catch (err) {
      console.error("Fehler beim Löschen:", err);
    }
  };

  // Drag & Drop
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  // Paste Support (CMD+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      const imageFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleUploadFiles(imageFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [leadId]);

  // Lightbox functions
  const openLightbox = (index: number) => {
    setActiveImageIndex(index);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setActiveImageIndex(null);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const nextImage = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (items.length <= 1 || activeImageIndex === null) return;
      setActiveImageIndex((prev) => ((prev ?? 0) + 1) % items.length);
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    },
    [items.length, activeImageIndex]
  );

  const prevImage = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (items.length <= 1 || activeImageIndex === null) return;
      setActiveImageIndex((prev) =>
        (prev ?? 0) === 0 ? items.length - 1 : (prev ?? 0) - 1
      );
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    },
    [items.length, activeImageIndex]
  );

  // Keyboard navigation & controls
  useEffect(() => {
    if (activeImageIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "+" || e.key === "=") {
        setZoomScale((z) => Math.min(z + 0.3, 5));
      }
      if (e.key === "-") {
        setZoomScale((z) => Math.max(z - 0.3, 0.5));
      }
      if (e.key === "0") {
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImageIndex, nextImage, prevImage]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoomScale((prev) => {
      const next = Math.min(Math.max(prev + delta, 0.5), 5);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  // Pan / Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: panOffset.x,
      initialOffsetY: panOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({
      x: panStartRef.current.initialOffsetX + dx,
      y: panStartRef.current.initialOffsetY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const activeImage =
    activeImageIndex !== null ? items[activeImageIndex] : null;

  return (
    <div className="space-y-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3
          className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: "var(--text-2)" }}
        >
          <ImageIcon className="size-3.5" style={{ color: "var(--accent)" }} />
          Bilder & Screenshots ({items.length})
        </h3>
        <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
          Drag & Drop oder CMD+V
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded p-2 text-xs bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Dropzone Area */}
      <div
        ref={dropzoneRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-all duration-150 ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--surface-3)] scale-[1.01]"
            : "hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
        }`}
        style={{
          borderColor: isDragging ? "var(--accent)" : "var(--border)",
          background: isDragging ? "var(--surface-3)" : "var(--surface-2)",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUploadFiles(e.target.files);
            }
          }}
        />

        {uploading ? (
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--accent)" }}>
            <Loader2 className="size-4 animate-spin" />
            Lade hoch…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Upload className="size-4 transition-transform group-hover:-translate-y-0.5" style={{ color: "var(--accent)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
              Bilder hier reinziehen oder klicken
            </span>
          </div>
        )}
      </div>

      {/* Thumbnails Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
          {items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => openLightbox(idx)}
              className="group relative aspect-square rounded-lg border overflow-hidden cursor-pointer shadow-sm transition-all hover:shadow-md hover:scale-[1.03]"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-3)",
              }}
              title={`${item.fileName} - Klicken zum Zoomen`}
            >
              <img
                src={item.url}
                alt={item.fileName}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ZoomIn className="size-5 text-white/90 drop-shadow" />
              </div>

              {/* Delete Button */}
              <button
                type="button"
                onClick={(e) => handleDelete(e, item.id)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white/80 hover:text-red-400 hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Screenshot löschen"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox / Zoom Viewer Modal */}
      {activeImage && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-md select-none animate-in fade-in duration-150"
          onClick={closeLightbox}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Top Bar */}
          <div
            className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0 bg-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-white/90 min-w-0">
              <span className="text-xs font-semibold truncate max-w-xs sm:max-w-md">
                {activeImage.fileName}
              </span>
              <span className="text-[11px] text-white/50">
                ({activeImageIndex! + 1} von {items.length})
              </span>
            </div>

            {/* Controls Toolbar */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.max(z - 0.25, 0.5))}
                className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Rauszoomen (-)"
              >
                <ZoomOut className="size-4" />
              </button>

              <span className="text-xs text-white/80 font-mono w-12 text-center">
                {Math.round(zoomScale * 100)}%
              </span>

              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.min(z + 0.25, 5))}
                className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Reinzoomen (+)"
              >
                <ZoomIn className="size-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Zoom zurücksetzen (0)"
              >
                <RotateCcw className="size-4" />
              </button>

              <a
                href={activeImage.url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors ml-1"
                title="In neuem Tab öffnen"
              >
                <ExternalLink className="size-4" />
              </a>

              <button
                type="button"
                onClick={closeLightbox}
                className="p-1.5 rounded-md bg-white/10 hover:bg-red-500/80 text-white transition-colors ml-2"
                title="Schließen (ESC)"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Viewport with Zoom and Pan */}
          <div
            className="flex-1 relative overflow-hidden flex items-center justify-center p-4"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            style={{
              cursor:
                zoomScale > 1
                  ? isPanning
                    ? "grabbing"
                    : "grab"
                  : "default",
            }}
          >
            {/* Prev Image Button */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={prevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 border border-white/10 text-white/80 hover:text-white hover:bg-black/90 transition-all z-10"
                title="Vorheriges Bild (Pfeil links)"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}

            {/* The Image */}
            <div
              className="transition-transform duration-75 ease-out select-none will-change-transform"
              style={{
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (zoomScale > 1) {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                } else {
                  setZoomScale(2);
                }
              }}
            >
              <img
                src={activeImage.url}
                alt={activeImage.fileName}
                className="max-h-[82vh] max-w-[90vw] object-contain rounded shadow-2xl pointer-events-none"
                draggable={false}
              />
            </div>

            {/* Next Image Button */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 border border-white/10 text-white/80 hover:text-white hover:bg-black/90 transition-all z-10"
                title="Nächstes Bild (Pfeil rechts)"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>

          {/* Bottom Hint */}
          <div className="py-2 text-center text-[11px] text-white/40 border-t border-white/5 bg-black/40">
            Mausrad zum Zoomen • Doppelklick zum Vergrößern • Gedrückt halten zum Verschieben • ESC zum Schließen
          </div>
        </div>
      )}
    </div>
  );
}
