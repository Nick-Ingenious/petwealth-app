"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** Minimal typing for the Barcode Detection API (Chrome/Android; not yet Safari). */
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

export const canScanInApp = () => typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

/** Pull a kit ID out of whatever the QR contains: a portal URL (?kit=…) or the bare ID. */
export function kitIdFromQr(raw: string): string {
  try {
    const u = new URL(raw);
    return u.searchParams.get("kit") ?? u.searchParams.get("code") ?? u.pathname.split("/").filter(Boolean).pop() ?? raw;
  } catch {
    return raw;
  }
}

/** Full-screen camera scanner; calls onResult with the first QR value it sees. */
export function Scanner({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) return onResult(codes[0].rawValue);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("We couldn't open the camera. Type the kit ID printed under the QR code instead.");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Scan kit QR code">
      <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2" aria-label="Close scanner">
        <X className="size-6" />
      </button>
      {error ? (
        <p className="m-auto max-w-xs text-center text-white">{error}</p>
      ) : (
        <>
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-64 rounded-3xl border-4 border-white/80" />
          </div>
          <p className="absolute inset-x-0 bottom-10 text-center text-white">Point at the QR code on the tube label</p>
        </>
      )}
    </div>
  );
}
