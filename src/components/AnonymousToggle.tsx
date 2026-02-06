import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { useAnonymousMode } from '../contexts/AnonymousModeContext';

export function AnonymousToggle() {
  const { isAnonymous, toggleAnonymous } = useAnonymousMode();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleAnonymous}
      className="px-3"
    >
      {isAnonymous ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </Button>
  );
}
