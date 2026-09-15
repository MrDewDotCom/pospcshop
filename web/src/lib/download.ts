/**
 * Saves text as a file. A download is the primary way to get anything out of the app, because the
 * Clipboard and Share APIs don't work over the shop LAN's plain http.
 */
export function downloadText(filename: string, text: string): void {
  // The BOM makes Windows Notepad open Thai text as UTF-8.
  downloadBlob(filename, new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
