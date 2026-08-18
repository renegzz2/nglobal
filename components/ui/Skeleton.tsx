
import React from 'react';

export const TableSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse space-y-6 w-full p-4">
      <div className="h-12 bg-surface-secondary rounded-2xl w-full mb-8"></div>
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border/50">
            <div className="h-10 w-10 bg-surface-secondary rounded-xl"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-secondary rounded w-1/4"></div>
              <div className="h-3 bg-surface-secondary rounded w-1/2 opacity-50"></div>
            </div>
            <div className="h-8 w-24 bg-surface-secondary rounded-full"></div>
            <div className="h-8 w-20 bg-surface-secondary rounded-lg"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse bg-white rounded-3xl border border-border p-6 space-y-4 shadow-soft">
      <div className="flex justify-between items-start">
        <div className="space-y-2 flex-1">
          <div className="h-6 bg-surface-secondary rounded w-1/3"></div>
          <div className="h-3 bg-surface-secondary rounded w-1/4"></div>
        </div>
        <div className="h-10 w-10 bg-surface-secondary rounded-xl"></div>
      </div>
      <div className="h-24 bg-surface-secondary/50 rounded-2xl"></div>
      <div className="flex justify-end gap-2">
        <div className="h-10 w-full bg-surface-secondary rounded-xl"></div>
      </div>
    </div>
  );
};
