
import React from 'react';
import StrategicPlanningPage from '../../components/StrategicPlanningPage';
import { User } from '../../types';

interface SubdireccionViewProps {
  user: User;
}

/**
 * Orquestador para Subdirección.
 * Controla la matriz de objetivos y la validación de la venta proyectada 2025.
 */
const SubdireccionView: React.FC<SubdireccionViewProps> = ({ user }) => {
  return (
    <div className="animate-fade-in">
      <div className="mb-4 bg-purple-50 p-4 rounded-xl border border-purple-200">
        <h2 className="text-lg font-bold text-purple-900">Módulo de Autorización Estratégica</h2>
        <p className="text-xs text-purple-700">Validación de metas y control de presupuesto por empaque.</p>
      </div>
      <StrategicPlanningPage user={user} />
    </div>
  );
};

export default SubdireccionView;
