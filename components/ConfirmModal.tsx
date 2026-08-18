import React from 'react';
import ReactDOM from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-surface rounded-lg shadow-xl max-w-md w-full border border-border animate-fade-in">
        <div className="p-6">
          <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
          <p className="text-text-secondary">{message}</p>
        </div>
        <div className="flex justify-end gap-3 p-4 bg-surface-secondary/30 rounded-b-lg border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-hover transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-danger text-white hover:bg-red-700 transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;