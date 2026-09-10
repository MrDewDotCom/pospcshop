import { useRef, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * "Take photo" + "Choose image" buttons. The camera uses `<input capture>` (not getUserMedia), because
 * the shop LAN is plain http and browsers only allow getUserMedia on https.
 */
export function ImagePickerButtons({
  onFiles,
  multiple = false,
  disabled = false,
  chooseLabel = 'เลือกรูป',
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  chooseLabel?: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [touch] = useState(isTouchDevice);

  const handle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // allow picking the same file again
    if (files.length) onFiles(files);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {touch && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera />
            ถ่ายรูป
          </Button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handle}
          />
        </>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => galleryRef.current?.click()}
      >
        <ImagePlus />
        {chooseLabel}
      </Button>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={handle}
      />
    </div>
  );
}
