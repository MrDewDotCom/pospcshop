/** Response of POST /api/files. URLs are served only to logged-in users. */
export interface UploadedFile {
  id: number;
  url: string;
  thumbUrl: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}
