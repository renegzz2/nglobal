
import React, { useState } from 'react';
import { User } from '../types';
import { signInWithPassword, sendMagicLink } from '../lib/supabase';
import { useNotification } from './NotificationProvider';

declare module 'react/jsx-runtime' {
  export {};
}

declare namespace JSX {
  interface Element {}
  interface IntrinsicAttributes {
    [key: string]: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

interface LoginProps {
  onLogin: (user: User) => void;
  onShowPolicies?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onShowPolicies }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [sent, setSent] = useState(false);
  const { addNotification } = useNotification();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || (mode === 'password' && !password)) return;

    setLoading(true);
    try {
      if (mode === 'password') {
        await signInWithPassword(email, password);
        addNotification({
          type: 'success',
          title: 'Acceso Autorizado',
          message: 'Bienvenido al Centro de Operaciones.'
        });
      } else {
        await sendMagicLink(email);
        setSent(true);
        addNotification({
          type: 'success',
          title: 'Enlace Enviado',
          message: 'Revisa tu bandeja de entrada para iniciar sesión.'
        });
      }
    } catch (err: any) {
      addNotification({
        type: 'danger',
        title: 'Error de Acceso',
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6 relative overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary"></div>
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-accent/5 rounded-full blur-3xl"></div>

      <div className="max-w-md w-full space-y-12 relative z-10">
        <div className="text-center space-y-4">
          <div className="mx-auto mb-8 flex justify-center animate-fade-in shadow-xl rounded-[2.5rem]">
            <div className="relative group p-2">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-[2.5rem] blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <img
                src="https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg"
                alt="nglobal logo"
                className="relative h-28 w-auto rounded-[2rem] shadow-2xl border-4 border-white transform transition-transform group-hover:scale-105"
              />
            </div>
          </div>
          <h2 className="text-4xl font-black text-primary uppercase tracking-tight font-display text-center">Inicia Sesión</h2>
          <p className="max-w-md mx-auto text-text-secondary font-medium text-sm leading-relaxed">
            Centro de Operaciones Logísticas nglobal. v4.0
          </p>
        </div>

        <div className="bg-white/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white shadow-2xl space-y-6">
          {!sent ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em] ml-2">Correo Corporativo</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@nglobal.com"
                    required
                    className="w-full px-6 py-4 bg-white border border-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-bold text-sm shadow-sm"
                  />
                </div>

                {mode === 'password' && (
                  <div className="space-y-2 animate-fade-in">
                    <div className="flex justify-between items-center ml-2">
                       <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Contraseña</label>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required={mode === 'password'}
                      className="w-full px-6 py-4 bg-white border border-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-bold text-sm shadow-sm"
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary-focus active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>{mode === 'password' ? 'Acceder' : 'Enviar Enlace'}</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                 <button
                   type="button"
                   onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setSent(false); }}
                   className="text-[10px] font-black text-accent uppercase tracking-widest hover:underline"
                 >
                   {mode === 'password' ? '¿Prefieres usar Enlace Mágico?' : '¿Preferiere usar Contraseña?'}
                 </button>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4 border border-success/20">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-primary uppercase tracking-tight">¡Enlace Enviado!</h3>
              <p className="text-sm text-text-secondary font-medium">
                Hemos enviado un acceso directo a <b>{email}</b>. Revisa tu bandeja y haz clic en el botón para entrar.
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-xs font-black text-accent uppercase tracking-widest hover:underline pt-4"
              >
                Regresar al Login
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 pt-4">
          <div className="flex gap-4">
             <button onClick={onShowPolicies} className="text-[10px] text-text-muted hover:text-primary uppercase font-black tracking-widest transition-colors">Privacidad</button>
             <span className="text-text-muted/20">•</span>
             <button onClick={onShowPolicies} className="text-[10px] text-text-muted hover:text-primary uppercase font-black tracking-widest transition-colors">Términos</button>
             <span className="text-text-muted/20">•</span>
             <button onClick={onShowPolicies} className="text-[10px] text-text-muted hover:text-primary uppercase font-black tracking-widest transition-colors">Soporte</button>
          </div>
          <p className="text-[10px] text-text-muted uppercase font-black tracking-[0.2em]">
            nglobal Logistics Operations Center v4.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

