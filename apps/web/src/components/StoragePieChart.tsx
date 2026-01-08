import React from 'react';

import { chat } from '@baab/shared';

interface StoragePieChartProps {
  bytesUsed: number;
  size?: number;
  maxBytes?: number;
}

export const StoragePieChart: React.FC<StoragePieChartProps> = ({
  bytesUsed,
  size = 60,
  maxBytes = chat.MAX_CONVERSATION_STORAGE_BYTES,
}) => {
  const percentage = Math.min(100, (bytesUsed / maxBytes) * 100);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color based on usage
  const getColor = () => {
    if (percentage >= 90) return '#ef4444'; // red-500
    if (percentage >= 70) return '#f59e0b'; // amber-500
    return '#22c55e'; // green-500
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="relative inline-flex items-center justify-center"
      title={`${formatBytes(bytesUsed)} / ${formatBytes(maxBytes)} (${percentage.toFixed(1)}%)`}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={4} />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300"
        />
      </svg>
      {/* Usage text in center */}
      <div className="absolute flex flex-col items-center leading-tight">
        <span className="font-medium" style={{ fontSize: size * 0.18 }}>
          {bytesUsed < 1024
            ? `${bytesUsed}B`
            : bytesUsed < 1024 * 1024
              ? `${(bytesUsed / 1024).toFixed(0)}KB`
              : `${(bytesUsed / (1024 * 1024)).toFixed(1)}MB`}
        </span>
        <span className="text-gray-400" style={{ fontSize: size * 0.12 }}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
};
