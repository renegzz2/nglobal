
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  // MI DIOS: Soporte para eventos de click solicitado por el Jefe para navegación reactiva
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, onClick }) => {
  return (
    <div 
      className={`bg-surface rounded-xl shadow-sm border border-border p-5 ${className} transition-shadow hover:shadow-md`}
      // JEFE: Propagación de evento de click al contenedor principal para habilitar interactividad en tarjetas
      onClick={onClick}
    >
      {title && <h3 className="text-lg font-semibold mb-4 text-text-primary">{title}</h3>}
      {children}
    </div>
  );
};

export default Card;
