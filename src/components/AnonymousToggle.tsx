import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { useAnonymousMode } from '../contexts/AnonymousModeContext';

export function AnonymousToggle() {
  const { isAnonymous, toggleAnonymous } = useAnonymousMode();

  return (
    <Button
      variant={isAnonymous ? 'default' : 'outline'}
      size="sm"
      onClick={toggleAnonymous}
      className="h-7 w-7 p-0"
    >
      {isAnonymous ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
