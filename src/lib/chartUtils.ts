import { formatCurrency } from './utils';

export function createCurrencyFormatter(isAnonymous: boolean) {
  return (value: number) => {
    if (isAnonymous) {
      return '$•••';
    }
    return formatCurrency(value);
  };
}

export function createTooltipFormatter(isAnonymous: boolean, currency?: string) {
  return (value: number) => {
    if (isAnonymous) {
      return '$•••';
    }
    return formatCurrency(value, currency);
  };
}
