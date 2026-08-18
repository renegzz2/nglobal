
import React from 'react';
import UsaShipmentReportPage from '../../components/UsaShipmentReportPage';

/**
 * Orquestador para Subgerencia.
 * Enfoque en la gestión diaria del reporte USA y asistencia en tráfico.
 */
const SubgerenciaView: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <div className="mb-4 bg-orange-50 p-4 rounded-xl border border-orange-200">
        <h2 className="text-lg font-bold text-orange-900">Control Operativo de Embarques</h2>
        <p className="text-xs text-orange-700">Monitoreo y actualización de estatus de viajes en tránsito.</p>
      </div>
      <UsaShipmentReportPage />
    </div>
  );
};

export default SubgerenciaView;
