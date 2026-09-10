import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api';

/** Shows a form-level error (e.g. wrong password) from a failed mutation. Renders nothing otherwise. */
export function FormAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{errorMessage(error)}</AlertDescription>
    </Alert>
  );
}
