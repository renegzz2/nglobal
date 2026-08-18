
import React from 'react';
import Dashboard from '../../components/Dashboard';
import UsaShipmentReportPage from '../../components/UsaShipmentReportPage';
import { View } from '../../types';

interface GerenciaViewProps {
  onViewChange: (view: View) => void;
}

/**
 * Orquestador para Gerencia Logística.
 * Proporciona una vista híbrida entre estadísticas de rendimiento y reportes de tráfico.
 */
const GerenciaView: React.FC<GerenciaViewProps> = ({ onViewChange }) => {
  return (
    <div className="animate-fade-in space-y-8">
      <div className="bg-gray-100 p-4 rounded-xl border border-gray-300">
        <h2 className="text-lg font-bold text-gray-800">Centro de Operaciones Logísticas</h2>
        <p className="text-xs text-gray-600 font-medium">Supervisión integral de la cadena de suministro internacional.</p>
      </div>
      <Dashboard onViewChange={onViewChange} />
      <div className="border-t border-border pt-8">
        <UsaShipmentReportPage />
      </div>
    </div>
  );
};

export default GerenciaView;
