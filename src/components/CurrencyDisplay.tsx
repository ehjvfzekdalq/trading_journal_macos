import { useAnonymousMode } from '../contexts/AnonymousModeContext';
import { formatCurrency } from '../lib/utils';

interface CurrencyDisplayProps {
  value: number;
  currency?: string;
  className?: string;
}

export function CurrencyDisplay({ value, currency, className }: CurrencyDisplayProps) {
  const { isAnonymous } = useAnonymousMode();

  if (isAnonymous) {
    return <span className={className}>$•••</span>;
  }

  return <span className={className}>{formatCurrency(value, currency)}</span>;
}
