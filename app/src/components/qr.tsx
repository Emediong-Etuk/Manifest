"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

export function QrDisplay({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#14213d", light: "#ffffff" },
    })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [value]);
  // Data-URL QR code: next/image adds nothing here.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? (
    <img src={src} alt={label} className="mx-auto w-full max-w-xs rounded-lg border-2 border-ink" />
  ) : null;
}

/** Camera QR scanner (lazy-loads @zxing/browser only when opened). */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        if (!video.current || cancelled) return;
        const controls = await reader.decodeFromVideoDevice(undefined, video.current, (result) => {
          if (result) {
            controls.stop();
            onResult(result.getText());
          }
        });
        stop = () => controls.stop();
      } catch {
        setError("Couldn't open the camera. Allow camera access, or paste the code below.");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onResult]);
  return (
    <div className="flex flex-col gap-2">
      <video
        ref={video}
        className="aspect-square w-full rounded-lg border-2 border-ink bg-ink object-cover"
        muted
        playsInline
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
