
import React, { useState } from 'react';
import StrategicPlanningPage from '../../components/StrategicPlanningPage';
import LiderProgramacionUsaPage from '../../components/LiderProgramacionUsaPage';
import { User, View } from '../../types';

interface LiderViewProps {
  user: User;
}

/**
 * Orquestador para Líder de Proyecto.
 * Alterna entre la planeación de metas y la programación técnica de lotes para USA.
 */
const LiderView: React.FC<LiderViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'program'>('plan');

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex bg-blue-50 p-1.5 rounded-xl border border-blue-200 w-fit">
        <button 
          onClick={() => setActiveTab('plan')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'plan' ? 'bg-primary text-white shadow-md' : 'text-blue-700 hover:bg-blue-100'}`}
        >
          1. Planeación Semanal
        </button>
        <button 
          onClick={() => setActiveTab('program')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'program' ? 'bg-primary text-white shadow-md' : 'text-blue-700 hover:bg-blue-100'}`}
        >
          2. Programación de Lotes
        </button>
      </div>

      <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
        {activeTab === 'plan' ? <StrategicPlanningPage user={user} /> : <LiderProgramacionUsaPage />}
      </div>
    </div>
  );
};

export default LiderView;
