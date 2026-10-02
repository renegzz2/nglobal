import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      alert('¡Contraseña actualizada con éxito! Ya puedes iniciar sesión con tu nueva clave.');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-border animate-slide-up">
        <h3 className="text-xl font-black text-primary uppercase tracking-tight">Restablecer Contraseña</h3>
        <p className="text-xs text-text-secondary font-medium mt-1 mb-6">
          Ingresa y confirma tu nueva contraseña para actualizar las credenciales de tu cuenta.
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/20 text-danger text-xs font-bold rounded-xl">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">
              Nueva Contraseña
            </label>
            <input
              type="password"
              required
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">
              Confirmar Contraseña
            </label>
            <input
              type="password"
              required
              placeholder="Repite tu contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 transition-all"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase text-text-muted hover:bg-gray-100 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="px-6 py-2.5 rounded-xl text-xs font-black uppercase bg-primary text-white hover:bg-primary-focus shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Actualizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordModal;