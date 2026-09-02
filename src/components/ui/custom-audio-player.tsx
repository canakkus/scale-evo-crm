"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Download,
  Gauge,
  Loader2,
  Sparkles,
  Music2,
} from "lucide-react";

interface CustomAudioPlayerProps {
  src: string;
  title?: string;
  fileName?: string;
  className?: string;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function CustomAudioPlayer({
  src,
  title,
  fileName,
  className = "",
}: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isHoveringBar, setIsHoveringBar] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return "0:00";
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    }
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Sync state with audio element
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      setIsLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);

      // Calculate buffered percentage
      const audio = audioRef.current;
      if (audio.buffered.length > 0 && audio.duration > 0) {
        try {
          const end = audio.buffered.end(audio.buffered.length - 1);
          setBufferedEnd((end / audio.duration) * 100);
        } catch {
          // ignore buffer error
        }
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleWaiting = () => setIsLoading(true);
  const handleCanPlay = () => setIsLoading(false);

  // Play / Pause Toggle
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Audio playback error:", err));
    }
  };

  // Skip relative in seconds (-10s, +10s, -5s, +5s)
  const skipTime = (seconds: number) => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime || 0;
    const newTime = Math.min(Math.max(0, current + seconds), duration || Infinity);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Scrub bar click & drag handling
  const handleSeekFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!progressBarRef.current || !audioRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    const targetTime = percentage * duration;

    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    handleSeekFromEvent(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleSeekFromEvent(moveEvent);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Hover over scrub bar for timestamp preview
  const handleMouseMoveBar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    setHoverPosition(clickX);
    setHoverTime(percentage * duration);
  };

  // Speed selection
  const handleSpeedChange = (speed: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
    setShowSpeedMenu(false);
  };

  // Volume
  const handleVolumeChange = (newVol: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    audioRef.current.volume = clamped;
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  // Download
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = fileName || "recording.mp3";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 shadow-lg select-none transition-all ${className}`}
      style={{
        background: "linear-gradient(135deg, rgba(28,28,28,0.95) 0%, rgba(18,18,18,0.95) 100%)",
        borderColor: "var(--border)",
      }}
    >
      {/* Hidden native audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
      />

      {/* Header Info (Optional Title / File Name + Animated Waveform) */}
      {(title || fileName) && (
        <div className="flex items-center justify-between gap-3 mb-3.5 pb-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
              <Music2 className="w-3.5 h-3.5" style={{ color: isPlaying ? "var(--status-warm-tx)" : "var(--text-3)" }} />
            </div>
            <span className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>
              {title || fileName}
            </span>
          </div>

          {/* Equalizer Visualizer Bars */}
          <div className="flex items-end gap-1 h-3.5 px-2 py-0.5 shrink-0">
            {[40, 80, 55, 95, 60, 85, 45].map((height, idx) => (
              <span
                key={idx}
                className="w-1 rounded-full transition-all duration-300"
                style={{
                  height: isPlaying ? `${Math.max(20, (height + idx * 10) % 100)}%` : "20%",
                  background: isPlaying ? "var(--status-warm-tx)" : "var(--text-3)",
                  opacity: isPlaying ? 0.9 : 0.4,
                  animation: isPlaying ? `pulse 0.8s ease-in-out infinite alternate ${idx * 0.15}s` : "none",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scrubber / Progress Bar Section */}
      <div className="space-y-1.5 mb-3">
        <div
          ref={progressBarRef}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHoveringBar(true)}
          onMouseLeave={() => setIsHoveringBar(false)}
          onMouseMove={handleMouseMoveBar}
          className="relative h-2.5 w-full rounded-full cursor-pointer flex items-center group touch-none"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          {/* Buffer Bar */}
          <div
            className="absolute top-0 bottom-0 left-0 rounded-full transition-all duration-200"
            style={{
              width: `${bufferedEnd}%`,
              background: "rgba(255,255,255,0.15)",
            }}
          />

          {/* Played Progress Bar */}
          <div
            className="absolute top-0 bottom-0 left-0 rounded-full transition-[width] duration-75 relative"
            style={{
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, #38bdf8 0%, #34d399 50%, #6be089 100%)",
              boxShadow: isPlaying ? "0 0 10px rgba(107, 224, 137, 0.4)" : "none",
            }}
          >
            {/* Scrubber Thumb */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-[#121212] transition-transform scale-90 group-hover:scale-125"
            />
          </div>

          {/* Hover Time Tooltip */}
          {isHoveringBar && hoverTime !== null && (
            <div
              className="absolute -top-7 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium pointer-events-none -translate-x-1/2 border shadow z-10"
              style={{
                left: `${hoverPosition}px`,
                background: "var(--surface-3)",
                color: "var(--text)",
                borderColor: "var(--border)",
              }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
          <span className="font-semibold" style={{ color: "var(--text-2)" }}>
            {formatTime(currentTime)}
          </span>
          <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {/* Left: Speed Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            title="Wiedergabegeschwindigkeit"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-[var(--surface-3)] active:scale-95 border"
            style={{
              background: playbackRate !== 1 ? "rgba(107, 224, 137, 0.15)" : "rgba(255,255,255,0.05)",
              color: playbackRate !== 1 ? "var(--status-warm-tx)" : "var(--text-2)",
              borderColor: playbackRate !== 1 ? "rgba(107, 224, 137, 0.3)" : "rgba(255,255,255,0.08)",
            }}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{playbackRate}x</span>
          </button>

          {/* Speed Dropdown Menu */}
          {showSpeedMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSpeedMenu(false)}
              />
              <div
                className="absolute left-0 bottom-full mb-1.5 z-20 rounded-lg border shadow-xl p-1 flex flex-col gap-0.5 min-w-[75px]"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
              >
                {SPEED_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleSpeedChange(rate)}
                    className={`px-2.5 py-1 text-xs rounded font-medium text-left transition-colors flex items-center justify-between ${
                      playbackRate === rate ? "font-bold" : "hover:bg-[var(--surface-3)]"
                    }`}
                    style={{
                      background: playbackRate === rate ? "var(--status-warm-bg)" : "transparent",
                      color: playbackRate === rate ? "var(--status-warm-tx)" : "var(--text-2)",
                    }}
                  >
                    <span>{rate}x</span>
                    {playbackRate === rate && <span className="text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Center: Main Playback Controls (-10s, Play/Pause, +10s) */}
        <div className="flex items-center gap-2">
          {/* Rewind 10 Seconds */}
          <button
            type="button"
            onClick={() => skipTime(-10)}
            title="10 Sekunden zurückspulen (J / ←)"
            className="group relative flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-[var(--surface-3)] active:scale-95 border"
            style={{
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.08)",
              color: "var(--text-2)",
            }}
          >
            <RotateCcw className="w-4 h-4 transition-transform group-hover:-rotate-12" />
            <span className="absolute -bottom-1 text-[8px] font-bold font-mono tracking-tighter" style={{ color: "var(--text-3)" }}>
              10
            </span>
          </button>

          {/* Primary Play / Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading && duration === 0}
            title={isPlaying ? "Pausieren (Leertaste)" : "Abspielen (Leertaste)"}
            className="flex items-center justify-center w-11 h-11 rounded-full shadow-md transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
            style={{
              background: isPlaying
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)",
              color: isPlaying ? "#ffffff" : "#0a0a0a",
              boxShadow: isPlaying
                ? "0 0 16px rgba(16, 185, 129, 0.4)"
                : "0 0 12px rgba(255, 255, 255, 0.2)",
            }}
          >
            {isLoading && duration === 0 ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Fast Forward 10 Seconds */}
          <button
            type="button"
            onClick={() => skipTime(10)}
            title="10 Sekunden vorspulen (L / →)"
            className="group relative flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-[var(--surface-3)] active:scale-95 border"
            style={{
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.08)",
              color: "var(--text-2)",
            }}
          >
            <RotateCw className="w-4 h-4 transition-transform group-hover:rotate-12" />
            <span className="absolute -bottom-1 text-[8px] font-bold font-mono tracking-tighter" style={{ color: "var(--text-3)" }}>
              10
            </span>
          </button>
        </div>

        {/* Right: Volume & Download */}
        <div className="flex items-center gap-1.5">
          {/* Volume Control */}
          <div
            className="relative flex items-center"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? "Ton an (M)" : "Stummschalten (M)"}
              className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{ color: isMuted ? "var(--status-lost-tx)" : "var(--text-2)" }}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            {/* Floating Volume Slider on Hover */}
            {showVolumeSlider && (
              <div
                className="absolute right-0 bottom-full mb-1 p-2 rounded-lg border shadow-xl flex items-center gap-2 z-20"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20 h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-400 bg-[var(--surface-3)]"
                />
                <span className="text-[10px] font-mono w-7 text-right" style={{ color: "var(--text-3)" }}>
                  {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                </span>
              </div>
            )}
          </div>

          {/* Download Audio Button */}
          <button
            type="button"
            onClick={handleDownload}
            title="Audiodatei herunterladen"
            className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
            style={{ color: "var(--text-2)" }}
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

