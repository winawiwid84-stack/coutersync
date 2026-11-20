import React, { useMemo } from 'react';
import { generateQrMatrix } from '../utils/format';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
}

export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({ value, size = 168, className = '' }) => {
  const matrix = useMemo(() => generateQrMatrix(value, 21), [value]);
  const cellCount = matrix.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${cellCount + 2} ${cellCount + 2}`}
      className={`bg-white rounded-lg ${className}`}
      role="img"
      aria-label={`QR Code untuk ${value}`}
    >
      <rect x="0" y="0" width={cellCount + 2} height={cellCount + 2} fill="#FFFFFF" />
      {matrix.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c + 1}
              y={r + 1}
              width="1"
              height="1"
              fill="#0F172A"
            />
          ) : null
        )
      )}
    </svg>
  );
};
