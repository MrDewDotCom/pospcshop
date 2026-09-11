import { useState, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { normalizeScannedCode } from '@pcshop/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/**
 * Scan serial numbers one after another (a scanner sends Enter after each). Counts for you, fixes codes
 * typed with the Thai keyboard layout, skips duplicates (case-insensitive), and accepts a pasted list.
 */
export function SerialScanner({
  serials,
  onChange,
  label,
  inputRef,
}: {
  serials: string[];
  onChange: (serials: string[]) => void;
  /** For screen readers, e.g. the product name. */
  label: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [text, setText] = useState('');

  const addSerials = (raw: string[]) => {
    const next = [...serials];
    const seen = new Set(next.map((s) => s.toUpperCase()));
    for (const value of raw) {
      const serial = normalizeScannedCode(value);
      if (!serial) continue;
      if (seen.has(serial.toUpperCase())) {
        toast.error(`ซีเรียล ${serial} สแกนไปแล้ว`);
        continue;
      }
      seen.add(serial.toUpperCase());
      next.push(serial);
    }
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addSerials([text]);
    setText('');
  };

  // Pasting a list (one serial per line) adds them all at once.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!/[\r\n\t]/.test(pasted.trim())) return;
    event.preventDefault();
    addSerials(pasted.split(/[\r\n\t]+/));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="สแกนซีเรียลทีละชิ้น (กด Enter)"
          aria-label={`สแกนซีเรียล ${label}`}
          className="font-mono"
          autoComplete="off"
        />
        <span className="shrink-0 text-sm font-medium tabular-nums">
          สแกนแล้ว {serials.length} ชิ้น
        </span>
      </div>
      {serials.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {serials.map((serial) => (
            <Badge key={serial} variant="outline" className="gap-1 pr-1 font-mono font-normal">
              {serial}
              <button
                type="button"
                aria-label={`ลบซีเรียล ${serial}`}
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => onChange(serials.filter((s) => s !== serial))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
