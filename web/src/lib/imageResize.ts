// Resizes photos in the browser before upload so the shop PC's disk doesn't fill up with 10 MB phone
// photos. Re-encoding also strips EXIF metadata (such as GPS location). Browsers apply the EXIF
// orientation when drawing, so rotated phone photos come out upright.

export class ImageDecodeError extends Error {}

export interface PreparedImage {
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** File extension matching the output type. */
  ext: 'jpg' | 'png';
}

export interface PrepareOptions {
  /** Longest side of the main image in pixels. Default 1600. */
  maxSide?: number;
  /** Keep PNG input as PNG (for logos with transparent backgrounds). Default false → JPEG. */
  keepPng?: boolean;
}

const THUMB_SIDE = 320;

async function loadImage(file: Blob): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageDecodeError(
      'เปิดไฟล์รูปนี้ไม่ได้ กรุณาใช้ไฟล์ JPG หรือ PNG (ถ้าเป็นรูป HEIC จาก iPhone ให้ถ่ายผ่านปุ่ม "ถ่ายรูป")',
    );
  }
  return { image, release: () => URL.revokeObjectURL(url) };
}

async function drawScaled(image: HTMLImageElement, maxSide: number, mime: string, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageDecodeError('เบราว์เซอร์นี้ย่อรูปไม่ได้');
  if (mime === 'image/jpeg') {
    // JPEG has no transparency: give transparent PNGs a white background instead of black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new ImageDecodeError('ย่อรูปไม่สำเร็จ กรุณาลองใหม่');
  return { blob, width, height };
}

export async function prepareImage(
  file: File,
  options: PrepareOptions = {},
): Promise<PreparedImage> {
  const { maxSide = 1600, keepPng = false } = options;
  const png = keepPng && file.type === 'image/png';
  const mime = png ? 'image/png' : 'image/jpeg';
  const { image, release } = await loadImage(file);
  try {
    const main = await drawScaled(image, maxSide, mime, 0.82);
    const thumb = await drawScaled(image, THUMB_SIDE, mime, 0.8);
    return {
      image: main.blob,
      thumb: thumb.blob,
      width: main.width,
      height: main.height,
      ext: png ? 'png' : 'jpg',
    };
  } finally {
    release();
  }
}
