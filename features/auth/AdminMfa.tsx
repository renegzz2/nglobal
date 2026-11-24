import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

export function AdminMfa() {
    const [factorId, setFactorId] = useState('');
    const [qrCode, setQrCode] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function prepare() {
        setBusy(true);
        setError('');
        try {
            const { data, error: listError } = await supabase.auth.mfa.listFactors();
            if (listError) throw listError;
            if (data.totp[0]) {
                setFactorId(data.totp[0].id);
                return;
            }
            for (const factor of data.all) {
                if (factor.factor_type !== 'totp' || factor.status !== 'unverified') continue;
                const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
                if (cleanupError) throw cleanupError;
            }
            const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
                factorType: 'totp', friendlyName: 'nGlobal',
            });
            if (enrollError) throw enrollError;
            setFactorId(enrollment.id);
            setQrCode(enrollment.totp.qr_code);
        } catch {
            setError('No se pudo preparar la verificación.');
        } finally {
            setBusy(false);
        }
    }

    async function verify(event: React.FormEvent) {
        event.preventDefault();
        if (!/^\d{6}$/.test(code) || busy) return;
        setBusy(true);
        setError('');
        try {
            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
            if (verifyError) throw verifyError;
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) throw refreshError;
        } catch {
            setError('No se pudo verificar el código. Usa el código vigente e inténtalo de nuevo.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="min-h-screen bg-background grid place-items-center p-6">
            <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
                <h1 className="mb-4 text-xl font-bold text-primary">Verificación en dos pasos</h1>
                {factorId ? (
                    <form onSubmit={verify} className="space-y-4">
                        {qrCode && <><p>Escanea este código con tu aplicación de autenticación.</p>
                            <img src={qrCode} alt="Código QR para configurar la verificación" className="mx-auto w-44" /></>}
                        <label className="block">
                            Código de seis dígitos
                            <input className="block w-full rounded border p-2" value={code}
                                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric" autoComplete="one-time-code" required />
                        </label>
                        <button disabled={busy} className="rounded bg-primary px-4 py-2 text-white">Verificar</button>
                    </form>
                ) : <button onClick={prepare} disabled={busy} className="rounded bg-primary px-4 py-2 text-white">Continuar</button>}
                {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
                <button onClick={() => void supabase.auth.signOut()} className="mt-4 block text-primary underline">Cerrar sesión</button>
            </section>
        </main>
    );
}
