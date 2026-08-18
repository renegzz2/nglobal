import React, { useState, useMemo } from 'react';
import { SortAscIcon, SortDescIcon } from '../icons';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  sortKey?: keyof T;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
  rowStyle?: (item: T) => React.CSSProperties;
  onReorder?: (newData: T[]) => void; // MI DIOS: Prop para habilitar movimiento de filas
}

const DataTable = <T extends { id: string | number }>({ 
  data, 
  columns, 
  pageSize = 10, 
  onRowClick,
  emptyMessage = "Sin resultados para mostrar.",
  isLoading = false,
  rowStyle,
  onReorder
}: DataTableProps<T>) => {
  const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || !onReorder) return;
    const newData = [...data];
    // Ajustamos el índice real basado en la paginación
    const actualDraggedIndex = (currentPage - 1) * pageSize + draggedIndex;
    const actualTargetIndex = (currentPage - 1) * pageSize + index;
    
    const [removed] = newData.splice(actualDraggedIndex, 1);
    newData.splice(actualTargetIndex, 0, removed);
    
    onReorder(newData);
    setDraggedIndex(null);
  };

  const requestSort = (key: keyof T) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden shadow-sm border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse responsive-table">
          <thead className="bg-primary text-white text-[10px] uppercase font-black tracking-widest sticky top-0 z-10 shadow-sm">
            <tr className="divide-x divide-white/10">
              {onReorder && <th className="w-10 px-2 text-center"></th>}
              {columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className={`px-6 py-2 whitespace-nowrap ${col.headerClassName || ''} ${col.sortKey ? 'cursor-pointer hover:bg-primary-focus transition-colors select-none' : ''}`}
                  onClick={() => col.sortKey && requestSort(col.sortKey)}
                >
                  <div className="flex items-center gap-2">
                    {col.header}
                    {col.sortKey && (
                      <div className="opacity-40">
                        {sortConfig?.key === col.sortKey ? (
                          sortConfig.direction === 'asc' ? <SortAscIcon className="w-3 h-3" /> : <SortDescIcon className="w-3 h-3" />
                        ) : (
                          <div className="flex flex-col -space-y-1">
                            <SortAscIcon className="w-2 h-2" />
                            <SortDescIcon className="w-2 h-2" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + (onReorder ? 1 : 0)} className="p-10 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-xs font-bold text-text-muted uppercase tracking-widest">Sincronizando...</p>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onReorder ? 1 : 0)} className="p-8 text-center text-text-muted italic font-medium">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, idx) => (
                <tr 
                  key={item.id} 
                  draggable={!!onReorder}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(idx)}
                  onClick={() => onRowClick?.(item)}
                  style={rowStyle ? rowStyle(item) : {}}
                  className={`hover:bg-hover/30 transition-all group cursor-pointer border-l-4 border-transparent ${draggedIndex === idx ? 'opacity-40 bg-gray-100' : ''}`}
                >
                  {onReorder && (
                    <td className="px-2 py-1.5 text-center cursor-move text-text-muted opacity-30 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M7 7h2v2H7V7zm0 4h2v2H7v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2zM7 3h2v2H7V3zm4 0h2v2h-2V3zM7 15h2v2H7v-2zm4 0h2v2h-2v-2z"/></svg>
                    </td>
                  )}
                  {columns.map((col, idx) => (
                    <td 
                      key={idx} 
                      data-label={col.header}
                      className={`px-6 py-1.5 whitespace-nowrap align-middle ${col.className || ''}`}
                    >
                      {typeof col.accessor === 'function' ? col.accessor(item) : (item[col.accessor] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && data.length > 0 && (
        <div className="p-3 bg-surface-secondary/20 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-black text-text-muted uppercase tracking-tighter">
            {Math.min(data.length, (currentPage - 1) * pageSize + 1)} - {Math.min(data.length, currentPage * pageSize)} de {data.length}
          </p>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-1.5 rounded-xl border border-border bg-white text-text-primary disabled:opacity-30 hover:bg-hover transition-all shadow-sm active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              
              <div className="flex gap-1 overflow-x-auto max-w-[150px] no-scrollbar">
                {[...Array(totalPages)].map((_, i) => {
                  if (totalPages > 5 && Math.abs(currentPage - (i + 1)) > 2) return null;
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`min-w-[28px] h-7 rounded-xl text-xs font-black transition-all ${currentPage === i + 1 ? 'bg-primary text-white shadow-md' : 'bg-white border border-border text-text-muted hover:border-primary'}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-1.5 rounded-xl border border-border bg-white text-text-primary disabled:opacity-30 hover:bg-hover transition-all shadow-sm active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataTable;