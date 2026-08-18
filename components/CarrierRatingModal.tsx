import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { TruckIcon } from './icons';

interface CarrierRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rating: number, comments: string) => void;
  tripId: string;
  carrierName: string;
}

const CarrierRatingModal: React.FC<CarrierRatingModalProps> = ({ isOpen, onClose, onConfirm, tripId, carrierName }) => {
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [hoverRating, setHoverRating] = useState(0);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-surface rounded-3xl shadow-2xl max-w-md w-full border border-border overflow-hidden animate-fade-in">
        <div className="p-6 bg-primary text-white text-center">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <TruckIcon className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight">Evaluación de Servicio</h3>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1">Viaje: {tripId}</p>
        </div>

        <div className="p-8 space-y-8 text-center">
          <div className="space-y-3">
            <p className="text-sm font-bold text-text-primary uppercase tracking-tight">¿Cómo califica el servicio de <span className="text-primary">{carrierName}</span>?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  className="p-1 transition-all active:scale-90"
                >
                  <svg 
                    className={`w-10 h-10 transition-colors ${
                      (hoverRating || rating) >= star ? 'text-amber-400' : 'text-gray-200'
                    }`} 
                    fill="currentColor" 
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              ))}
            </div>
            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
              {rating === 1 ? 'Deficiente' : rating === 2 ? 'Regular' : rating === 3 ? 'Bueno' : rating === 4 ? 'Excelente' : rating === 5 ? 'Sobresaliente' : 'Seleccione una calificación'}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-text-muted uppercase block text-left ml-1">Observaciones Críticas</label>
            <textarea
              className="w-full bg-background border border-border rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all h-24 no-scrollbar"
              placeholder="Ej: Entrega puntual, unidad impecable..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button 
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl font-black text-xs text-text-secondary uppercase hover:bg-hover transition-all"
            >
              Omitir
            </button>
            <button 
              disabled={rating === 0}
              onClick={() => onConfirm(rating, comments)}
              className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-primary-focus transition-all disabled:opacity-30 active:scale-95"
            >
              Guardar Auditoría
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CarrierRatingModal;