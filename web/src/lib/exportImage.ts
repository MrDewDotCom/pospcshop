// Turns a rendered document (receipt, return slip, …) into a PNG or an A4 PDF (PLAN.md §11).
// html-to-image draws the DOM node into a canvas; fonts are embedded as data so Thai text renders
// with Sarabun even inside the exported image. Everything stays offline: fonts come from @fontsource.

import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadBlob } from './download';

/** 540px layout × 2 = the 1080px-wide image LINE and Messenger show well. */
export const DOCUMENT_WIDTH_PX = 540;
const PIXEL_RATIO = 2;

let fontEmbedCss: Promise<string> | null = null;

// Safari can miss fonts or images on the first render (risk R2), so it gets a throwaway render first.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

async function whenReady(node: HTMLElement): Promise<string> {
  // Ask for the document font explicitly (a font only loads once something uses it), then wait for
  // every pending font and every image inside the document.
  await Promise.all([
    document.fonts.load('400 16px Sarabun', 'กข'),
    document.fonts.load('600 16px Sarabun', 'กข'),
    document.fonts.load('700 16px Sarabun', 'กข'),
  ]);
  await document.fonts.ready;
  await Promise.all(
    [...node.querySelectorAll('img')].map((img) =>
      img.complete
        ? null
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
    ),
  );
  // Embedding the fonts is the slow part; it's the same for every document, so do it once.
  fontEmbedCss ??= getFontEmbedCSS(node).catch((error: unknown) => {
    fontEmbedCss = null;
    throw error;
  });
  return fontEmbedCss;
}

export async function documentToCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  const options = {
    pixelRatio: PIXEL_RATIO,
    backgroundColor: '#ffffff',
    fontEmbedCSS: await whenReady(node),
  };
  if (isSafari) await toCanvas(node, options);
  return toCanvas(node, options);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))),
      'image/png',
    ),
  );
}

export async function downloadDocumentPng(node: HTMLElement, filename: string): Promise<void> {
  downloadBlob(filename, await canvasToBlob(await documentToCanvas(node)));
}

/**
 * A4 portrait PDF with the document centred at roughly its on-screen size. A document taller than one
 * page continues on the next pages.
 */
export async function downloadDocumentPdf(node: HTMLElement, filename: string): Promise<void> {
  const canvas = await documentToCanvas(node);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const imageWidth = 150;
  const mmPerPx = imageWidth / canvas.width;
  const sliceHeightPx = Math.floor((pageHeight - 2 * margin) / mmPerPx);

  for (let top = 0, page = 0; top < canvas.height; top += sliceHeightPx, page++) {
    const height = Math.min(sliceHeightPx, canvas.height - top);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = height;
    slice
      .getContext('2d')!
      .drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height);
    if (page > 0) pdf.addPage();
    // 'FAST' = deflate the image data; without it a one-page receipt is several megabytes.
    pdf.addImage(
      slice,
      'PNG',
      (pageWidth - imageWidth) / 2,
      margin,
      imageWidth,
      height * mmPerPx,
      undefined,
      'FAST',
    );
  }
  downloadBlob(filename, pdf.output('blob'));
}
