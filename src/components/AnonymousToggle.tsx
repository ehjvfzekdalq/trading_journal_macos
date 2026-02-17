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
      className="px-2 sm:px-3"
    >
      {isAnonymous ? (
        <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      ) : (
        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      )}
    </Button>
  );
}
