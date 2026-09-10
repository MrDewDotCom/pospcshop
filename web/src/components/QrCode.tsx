import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders `text` as a QR code image (generated locally, no network). */
export function QrCode({
  text,
  size = 240,
  className,
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setDataUrl(undefined));
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  return dataUrl ? (
    <img src={dataUrl} alt={`QR: ${text}`} width={size} height={size} className={className} />
  ) : (
    <div style={{ width: size, height: size }} className={className} />
  );
}
