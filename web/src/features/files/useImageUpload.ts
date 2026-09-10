import { useMutation } from '@tanstack/react-query';
import type { UploadedFile } from '@pcshop/shared';
import { api } from '@/lib/api';
import { prepareImage, type PrepareOptions } from '@/lib/imageResize';

/** Resizes a picked photo in the browser, then uploads the image and its thumbnail. */
export async function uploadImage(file: File, options?: PrepareOptions): Promise<UploadedFile> {
  const prepared = await prepareImage(file, options);
  const form = new FormData();
  form.append('image', prepared.image, `image.${prepared.ext}`);
  form.append('thumb', prepared.thumb, `thumb.${prepared.ext}`);
  form.append('width', String(prepared.width));
  form.append('height', String(prepared.height));
  return api.upload<UploadedFile>('/api/files', form);
}

export function useImageUpload(options?: PrepareOptions) {
  return useMutation({ mutationFn: (file: File) => uploadImage(file, options) });
}
