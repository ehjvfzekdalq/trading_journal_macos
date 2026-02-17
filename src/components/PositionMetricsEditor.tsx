import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
  calculateFromMargin,
  calculateFromPositionSize,
  calculateFromQuantity,
  calculateFromOneR,
  type PositionType
} from '../lib/calculations';
import { AlertCircle } from 'lucide-react';

interface PositionMetricsEditorProps {
  // Required for calculations
  entryPrice: number;
  stopLoss: number;
  leverage: number;
  positionType: PositionType;

  // Initial values
  initialMargin: number;
  initialPositionSize: number;
  initialQuantity: number;
  initialOneR: number;

  // Callback when values change
  onChange: (metrics: {
    margin: number;
    positionSize: number;
    quantity: number;
    oneR: number;
  }) => void;

  // Optional
  label?: string;
  disabled?: boolean;
}

type FieldName = 'margin' | 'positionSize' | 'quantity' | 'oneR';

export function PositionMetricsEditor({
  entryPrice,
  stopLoss,
  leverage,
  positionType,
  initialMargin,
  initialPositionSize,
  initialQuantity,
  initialOneR,
  onChange,
  label,
  disabled = false,
}: PositionMetricsEditorProps) {
  const { t } = useTranslation();

  // Local state for field values (display values)
  const [margin, setMargin] = useState<string>(initialMargin.toString());
  const [positionSize, setPositionSize] = useState<string>(initialPositionSize.toString());
  const [quantity, setQuantity] = useState<string>(initialQuantity.toString());
  const [oneR, setOneR] = useState<string>(initialOneR.toString());

  // Track which field was last edited (for visual highlighting)
  const [lastEdited, setLastEdited] = useState<FieldName | null>(null);

  // Track if we're in the middle of editing (for debouncing)
  const [editingField, setEditingField] = useState<FieldName | null>(null);

  // Sync with prop changes
  useEffect(() => {
    if (!editingField) {
      setMargin(initialMargin.toFixed(2));
      setPositionSize(initialPositionSize.toFixed(2));
      setQuantity(initialQuantity.toFixed(8));
      setOneR(initialOneR.toFixed(2));
    }
  }, [initialMargin, initialPositionSize, initialQuantity, initialOneR, editingField]);

  // Validation
  const hasRequiredData = useMemo(() => {
    return entryPrice > 0 && stopLoss > 0 && entryPrice !== stopLoss && leverage > 0;
  }, [entryPrice, stopLoss, leverage]);

  // Debounced calculation handler
  useEffect(() => {
    if (!editingField || !hasRequiredData) return;

    const timeoutId = setTimeout(() => {
      try {
        const marginNum = parseFloat(margin);
        const positionSizeNum = parseFloat(positionSize);
        const quantityNum = parseFloat(quantity);
        const oneRNum = parseFloat(oneR);

        // Calculate other fields based on which one was edited
        switch (editingField) {
          case 'margin':
            if (marginNum > 0) {
              const calculated = calculateFromMargin(
                marginNum,
                leverage,
                entryPrice,
                stopLoss,
                positionType
              );
              setPositionSize(calculated.positionSize.toFixed(2));
              setQuantity(calculated.quantity.toFixed(8));
              setOneR(calculated.oneR.toFixed(2));
              onChange({
                margin: marginNum,
                positionSize: calculated.positionSize,
                quantity: calculated.quantity,
                oneR: calculated.oneR,
              });
            }
            break;

          case 'positionSize':
            if (positionSizeNum > 0) {
              const calculated = calculateFromPositionSize(
                positionSizeNum,
                leverage,
                entryPrice,
                stopLoss,
                positionType
              );
              setMargin(calculated.margin.toFixed(2));
              setQuantity(calculated.quantity.toFixed(8));
              setOneR(calculated.oneR.toFixed(2));
              onChange({
                margin: calculated.margin,
                positionSize: positionSizeNum,
                quantity: calculated.quantity,
                oneR: calculated.oneR,
              });
            }
            break;

          case 'quantity':
            if (quantityNum > 0) {
              const calculated = calculateFromQuantity(
                quantityNum,
                leverage,
                entryPrice,
                stopLoss,
                positionType
              );
              setMargin(calculated.margin.toFixed(2));
              setPositionSize(calculated.positionSize.toFixed(2));
              setOneR(calculated.oneR.toFixed(2));
              onChange({
                margin: calculated.margin,
                positionSize: calculated.positionSize,
                quantity: quantityNum,
                oneR: calculated.oneR,
              });
            }
            break;

          case 'oneR':
            if (oneRNum > 0) {
              const calculated = calculateFromOneR(
                oneRNum,
                leverage,
                entryPrice,
                stopLoss,
                positionType
              );
              setMargin(calculated.margin.toFixed(2));
              setPositionSize(calculated.positionSize.toFixed(2));
              setQuantity(calculated.quantity.toFixed(8));
              onChange({
                margin: calculated.margin,
                positionSize: calculated.positionSize,
                quantity: calculated.quantity,
                oneR: oneRNum,
              });
            }
            break;
        }

        setEditingField(null);
      } catch (error) {
        console.error('Position metrics calculation error:', error);
        setEditingField(null);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [editingField, margin, positionSize, quantity, oneR, leverage, entryPrice, stopLoss, positionType, hasRequiredData, onChange]);

  // Handle field change
  const handleFieldChange = (field: FieldName, value: string) => {
    setLastEdited(field);
    setEditingField(field);

    switch (field) {
      case 'margin':
        setMargin(value);
        break;
      case 'positionSize':
        setPositionSize(value);
        break;
      case 'quantity':
        setQuantity(value);
        break;
      case 'oneR':
        setOneR(value);
        break;
    }
  };

  if (!hasRequiredData) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>{t('positionMetrics.missingData')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{label}</h3>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Margin */}
        <div>
          <Label htmlFor="position-margin" className="text-xs">
            {t('positionMetrics.margin')}
          </Label>
          <Input
            id="position-margin"
            type="number"
            step="0.01"
            min="0"
            value={margin}
            onChange={(e) => handleFieldChange('margin', e.target.value)}
            disabled={disabled}
            className={`font-mono text-sm ${
              lastEdited === 'margin' ? 'ring-2 ring-blue-500' : ''
            }`}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('positionMetrics.marginTooltip')}
          </p>
        </div>

        {/* Cost (Position Size) */}
        <div>
          <Label htmlFor="position-cost" className="text-xs">
            {t('positionMetrics.cost')}
          </Label>
          <Input
            id="position-cost"
            type="number"
            step="0.01"
            min="0"
            value={positionSize}
            onChange={(e) => handleFieldChange('positionSize', e.target.value)}
            disabled={disabled}
            className={`font-mono text-sm ${
              lastEdited === 'positionSize' ? 'ring-2 ring-blue-500' : ''
            }`}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('positionMetrics.costTooltip')}
          </p>
        </div>

        {/* Position (Quantity) */}
        <div>
          <Label htmlFor="position-quantity" className="text-xs">
            {t('positionMetrics.position')}
          </Label>
          <Input
            id="position-quantity"
            type="number"
            step="0.00000001"
            min="0"
            value={quantity}
            onChange={(e) => handleFieldChange('quantity', e.target.value)}
            disabled={disabled}
            className={`font-mono text-sm ${
              lastEdited === 'quantity' ? 'ring-2 ring-blue-500' : ''
            }`}
            placeholder="0.00000000"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('positionMetrics.positionTooltip')}
          </p>
        </div>

        {/* 1R */}
        <div>
          <Label htmlFor="position-oner" className="text-xs">
            {t('positionMetrics.oneR')}
          </Label>
          <Input
            id="position-oner"
            type="number"
            step="0.01"
            min="0"
            value={oneR}
            onChange={(e) => handleFieldChange('oneR', e.target.value)}
            disabled={disabled}
            className={`font-mono text-sm ${
              lastEdited === 'oneR' ? 'ring-2 ring-blue-500' : ''
            }`}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('positionMetrics.oneRTooltip')}
          </p>
        </div>
      </div>
    </div>
  );
}
