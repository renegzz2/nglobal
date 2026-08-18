import React from 'react';
import { ShipmentStatus } from '../../types';

interface BadgeProps {
  status: ShipmentStatus;
}

const Badge: React.FC<BadgeProps> = ({ status }) => {
  let colorClass = '';

  switch (status) {
    case ShipmentStatus.IN_TRANSIT:
      colorClass = 'bg-info-content text-info border-info/20';
      break;
    case ShipmentStatus.DELIVERED:
      colorClass = 'bg-success-content text-success border-success/20';
      break;
    case ShipmentStatus.DELAYED:
      colorClass = 'bg-danger-content text-danger border-danger/20';
      break;
    case ShipmentStatus.PENDING:
      colorClass = 'bg-warning-content text-warning border-warning/20';
      break;
    case ShipmentStatus.HOLD:
      colorClass = 'bg-purple-100 text-purple-700 border-purple-200 uppercase font-black';
      break;
    default:
      colorClass = 'bg-gray-100 text-gray-800 border-gray-200';
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {status}
    </span>
  );
};

export default Badge;