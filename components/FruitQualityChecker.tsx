
import React, { useState, useRef, useEffect } from 'react';
import Card from './ui/Card';
import { useNotification } from './NotificationProvider';
import { analyzeImage } from '../services/geminiService';

interface QualityHistoryItem {
    id: string;
    timestamp: string;
    image: string;
    status: 'OPTIMO' | 'RECHAZO' | 'PRECAUCION';
    analysis: string;
    details: string[];
}

const FruitQualityChecker: React.FC = () => {
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{
        status: 'OPTIMO' | 'RECHAZO' | 'PRECAUCION' | null;
        analysis: string;
        details: string[];
    } | null>(null);
    const [scanPoints, setScanPoints] = useState<{ x: number, y: number, delay: number }[]>([]);
    const [history, setHistory] = useState<QualityHistoryItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addNotification } = useNotification();

    // Cargar historial inicial
    useEffect(() => {
        const savedHistory = localStorage.getItem('fruit_quality_history');
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error("Error al cargar historial", e);
            }
        }
    }, []);

    // Guardar historial cuando cambie
    useEffect(() => {
        localStorage.setItem('fruit_quality_history', JSON.stringify(history));
    }, [history]);

    // Generar puntos de escaneo aleatorios cuando se inicia el análisis
    useEffect(() => {
        if (loading) {
            const points = Array.from({ length: 12 }).map(() => ({
                x: Math.random() * 80 + 10,
                y: Math.random() * 80 + 10,
                delay: Math.random() * 2
            }));
            setScanPoints(points);
        } else {
            setScanPoints([]);
        }
    }, [loading]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
                setResult(null);
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzeQuality = async () => {
        if (!image) return;

        setLoading(true);
        try {
            const base64Data = image.split(',')[1];

            const prompt = `Actúa como un inspector senior de calidad agrícola para nglobal Logistics.
            Analiza la fruta o vegetal en la imagen y determina su estado para exportación o consumo.
            
            Busca específicamente:
            1. Daños mecánicos (golpes, cortes).
            2. Presencia de moho o patógenos.
            3. Grado de madurez (sobre-maduración).
            4. Deshidratación o arrugas.

            REGLAS DE RESPUESTA:
            - Empieza con una palabra en mayúsculas: OPTIMO, RECHAZO o PRECAUCION.
            - Luego da una breve descripción técnica (máx 40 palabras).
            - Finalmente lista 3 puntos clave precedidos por un guión (-).`;

            // Usamos el servicio seguro en lugar de llamar a la API directamente
            const text = await analyzeImage(prompt, base64Data);
            
            const lines = text.split('\n').filter(l => l.trim());
            
            let status: 'OPTIMO' | 'RECHAZO' | 'PRECAUCION' = 'OPTIMO';
            if (text.includes('RECHAZO')) status = 'RECHAZO';
            else if (text.includes('PRECAUCION')) status = 'PRECAUCION';

            const analysis = lines.find(l => !l.startsWith('-') && !['OPTIMO', 'RECHAZO', 'PRECAUCION'].includes(l.trim().replace(/[^A-Z]/g, ''))) || 'Análisis completado.';
            const details = lines.filter(l => l.startsWith('-')).map(l => l.replace(/^- /, ''));

            const newResult = { status, analysis, details };
            setResult(newResult);

            // Agregar al historial
            const historyItem: QualityHistoryItem = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                image: image,
                status,
                analysis,
                details
            };
            setHistory(prev => [historyItem, ...prev].slice(0, 10)); // Mantener últimos 10

            addNotification({ type: 'success', title: 'Análisis Completo', message: 'La IA ha procesado la imagen correctamente.' });
        } catch (error) {
            console.error(error);
            addNotification({ type: 'danger', title: 'Error de IA', message: 'No se pudo procesar la imagen. Verifique la conexión.' });
        } finally {
            setLoading(false);
        }
    };

    const loadFromHistory = (item: QualityHistoryItem) => {
        setImage(item.image);
        setResult({
            status: item.status,
            analysis: item.analysis,
            details: item.details
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setHistory(prev => prev.filter(item => item.id !== id));
    };

    const reset = () => {
        setImage(null);
        setResult(null);
    };

    return (
        <div className="max-w-5xl mx-auto animate-fade-in space-y-8 pb-20">
            <style>
                {`
                @keyframes scanLine {
                    0% { transform: translateY(0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(256px); opacity: 0; }
                }
                @keyframes pulsePoint {
                    0%, 100% { transform: scale(1); opacity: 0.3; }
                    50% { transform: scale(1.5); opacity: 1; }
                }
                .scanning-line {
                    height: 2px;
                    background: linear-gradient(to right, transparent, var(--color-primary), transparent);
                    box-shadow: 0 0 15px var(--color-primary), 0 0 5px white;
                    width: 100%;
                    position: absolute;
                    z-index: 20;
                    animation: scanLine 2s linear infinite;
                }
                .scan-point {
                    position: absolute;
                    width: 8px;
                    height: 8px;
                    background-color: var(--color-primary);
                    border-radius: 50%;
                    box-shadow: 0 0 10px var(--color-primary);
                    z-index: 15;
                    animation: pulsePoint 1.5s ease-in-out infinite;
                }
                `}
            </style>

            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-text-primary">Inspección de Calidad Visual</h2>
                    <p className="text-sm text-text-secondary italic">Análisis biométrico asistido por Gemini AI.</p>
                </div>
                {history.length > 0 && (
                    <button 
                        onClick={() => { if(confirm('¿Borrar todo el historial?')) setHistory([]); }}
                        className="text-xs font-bold text-danger hover:underline"
                    >
                        Limpiar Historial
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Lado Izquierdo: Scanner (Carga y Visualización) */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="flex flex-col items-center justify-center min-h-[400px] border-dashed border-2 p-0 overflow-hidden bg-surface relative">
                        {!image ? (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex flex-col items-center justify-center cursor-pointer group w-full h-full p-12"
                            >
                                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform mb-4">
                                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </div>
                                <p className="text-lg font-bold text-text-primary">Capturar Fruta</p>
                                <p className="text-xs text-text-muted mt-1 text-center">Inicia el scanner visual de calidad</p>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center">
                                <div className="relative w-full h-80 overflow-hidden bg-black">
                                    <img src={image} alt="Preview" className={`w-full h-full object-contain transition-all duration-700 ${loading ? 'brightness-50 grayscale-[0.3]' : ''}`} />
                                    
                                    {loading && (
                                        <>
                                            <div className="scanning-line" />
                                            <div className="absolute inset-0 bg-primary/10 mix-blend-overlay pointer-events-none"></div>
                                            {scanPoints.map((p, i) => (
                                                <div 
                                                    key={i} 
                                                    className="scan-point" 
                                                    style={{ 
                                                        left: `${p.x}%`, 
                                                        top: `${p.y}%`, 
                                                        animationDelay: `${p.delay}s` 
                                                    }} 
                                                />
                                            ))}
                                            <div className="absolute bottom-4 left-0 right-0 text-center z-30">
                                                <span className="bg-primary/80 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full animate-pulse shadow-lg">
                                                    Analizando Biometría...
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex gap-4 w-full p-6 bg-surface border-t border-border">
                                    <button 
                                        onClick={reset}
                                        className="flex-1 px-4 py-3 border border-border rounded-xl text-sm font-bold text-text-muted hover:bg-hover transition-colors"
                                        disabled={loading}
                                    >
                                        Nueva Captura
                                    </button>
                                    <button 
                                        onClick={analyzeQuality}
                                        disabled={loading}
                                        className="flex-1 px-4 py-3 bg-primary text-white rounded-xl text-sm font-bold shadow-md hover:bg-primary-focus active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            'Iniciar Análisis IA'
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                    </Card>

                    {/* Sección de Historial Rápido */}
                    {history.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Historial Reciente
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {history.map((item) => (
                                    <button 
                                        key={item.id}
                                        onClick={() => loadFromHistory(item)}
                                        className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-all shadow-sm active:scale-95"
                                    >
                                        <img src={item.image} alt="History thumbnail" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                        <div className={`absolute bottom-0 inset-x-0 h-1.5 ${
                                            item.status === 'OPTIMO' ? 'bg-success' :
                                            item.status === 'RECHAZO' ? 'bg-danger' :
                                            'bg-warning'
                                        }`}></div>
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <button 
                                                onClick={(e) => deleteHistoryItem(e, item.id)}
                                                className="p-1.5 bg-danger text-white rounded-full hover:bg-danger-focus"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Lado Derecho: Resultados */}
                <div className="space-y-4">
                    {result ? (
                        <div className="animate-fade-in space-y-4 sticky top-6">
                            <div className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center shadow-lg transition-all ${
                                result.status === 'OPTIMO' ? 'bg-success/5 border-success/30' :
                                result.status === 'RECHAZO' ? 'bg-danger/5 border-danger/30' :
                                'bg-warning/5 border-warning/30'
                            }`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
                                    result.status === 'OPTIMO' ? 'bg-success text-white' :
                                    result.status === 'RECHAZO' ? 'bg-danger text-white' :
                                    'bg-warning text-white'
                                } shadow-md`}>
                                    {result.status === 'OPTIMO' ? (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    ) : result.status === 'RECHAZO' ? (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                    ) : (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    )}
                                </div>
                                <span className={`text-4xl font-black mb-2 tracking-tighter ${
                                    result.status === 'OPTIMO' ? 'text-success' :
                                    result.status === 'RECHAZO' ? 'text-danger' :
                                    'text-warning'
                                }`}>{result.status}</span>
                                <p className="text-sm font-medium text-text-primary leading-relaxed px-2">
                                    {result.analysis}
                                </p>
                            </div>

                            <Card title="Mapa de Diagnóstico">
                                <ul className="space-y-4">
                                    {result.details.map((detail, i) => (
                                        <li key={i} className="flex items-start gap-3 text-sm text-text-secondary group">
                                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0 group-hover:scale-150 transition-transform"></div>
                                            <span className="leading-tight">{detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>

                            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex items-center gap-4">
                                <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <p className="text-[11px] text-text-secondary font-medium leading-snug italic">
                                    "La IA es una herramienta de apoyo preventivo. El dictamen final de embarque corresponde a la autoridad fitosanitaria."
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-surface p-12 rounded-2xl border border-border border-dashed flex flex-col items-center justify-center text-center h-[500px] text-text-muted opacity-60">
                            <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-6 shadow-inner">
                                <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            </div>
                            <h3 className="font-bold text-text-secondary text-lg">Scanner IA Listo</h3>
                            <p className="text-sm mt-2 max-w-[200px]">Capture o suba una fotografía para iniciar el procesamiento técnico.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FruitQualityChecker;
