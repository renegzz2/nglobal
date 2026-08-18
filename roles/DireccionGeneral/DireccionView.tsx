
import React from 'react';
import Dashboard from '../../components/Dashboard';
import { View } from '../../types';

interface DireccionViewProps {
  onViewChange: (view: View) => void;
}

/**
 * Orquestador para Dirección General.
 * Proporciona acceso exclusivamente a la visualización de datos estratégicos.
 */
const DireccionView: React.FC<DireccionViewProps> = ({ onViewChange }) => {
  return (
    <div className="animate-fade-in space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
        <h2 className="text-lg font-bold text-primary">Consola de Dirección General</h2>
        <p className="text-xs text-text-secondary italic">Visualización de KPIs Estratégicos y Rendimiento Global.</p>
      </div>
      <Dashboard onViewChange={onViewChange} />
    </div>
  );
};

export default DireccionView;
