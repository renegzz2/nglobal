import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { LiderProgramacionUsaReport } from '../types';

interface ExcelImporterProps {
    onImportComplete: (data: Partial<LiderProgramacionUsaReport>) => void;
}

const ExcelImporter: React.FC<ExcelImporterProps> = ({ onImportComplete }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Función auxiliar para leer celdas seguras (ej. leerCelda('C3'))
                const leerCelda = (celda: string) => worksheet[celda] ? String(worksheet[celda].v).trim() : '';

                // 1. EXTRAER DATOS FIJOS (Ajusta las letras/números según tu Excel real)
                // Suponiendo que Proyecto está en B3 (o combinada desde B3)
                const proyectoCrudo = leerCelda('B3') || leerCelda('C3'); 
                const fechaSalida = leerCelda('H6'); // Ajusta a la celda de tu fecha
                const horaSalida = leerCelda('H8'); // Ajusta a la celda de tu hora
                const termografo = leerCelda('H25'); 
                const temperatura = leerCelda('H24');

                // 2. EXTRAER LA TABLA DINÁMICA DE PRODUCTOS
                const productosImportados = [];
                // Asumiendo que los productos empiezan en la fila 15
                let filaActual = 15; 
                
                while (filaActual < 50) { // Límite de seguridad
                    // Columna A o B para Cajas (Unidad), Columna E o F para Producto
                    const cajas = parseInt(leerCelda(`B${filaActual}`) || leerCelda(`A${filaActual}`), 10);
                    const descripcion = leerCelda(`F${filaActual}`) || leerCelda(`E${filaActual}`);
                    
                    // Si encontramos una fila sin producto o llegamos al pie de página, detenemos la lectura
                    if (!descripcion || descripcion.includes('Línea Transportista')) break;

                    if (!isNaN(cajas) && cajas > 0) {
                        productosImportados.push({
                            productId: '__MANUAL_PRODUCT__', // Forzamos manual para que busque coincidencia
                            manualProductName: descripcion.toUpperCase(),
                            quantity: cajas
                        });
                    }
                    filaActual++;
                }

                // 3. CONSTRUIR EL OBJETO PARA EL FORMULARIO
                const datosFormateados: Partial<LiderProgramacionUsaReport> = {
                    proyecto: proyectoCrudo.toUpperCase(),
                    projectId: '__MANUAL_PROJECT__', 
                    loteId: leerCelda('H4'), // Remisión
                    productos: productosImportados as any,
                    temperaturaIdeal: temperatura,
                    tiveTrackerId: termografo,
                    // Si logras unir fechaSalida y horaSalida a formato YYYY-MM-DDTHH:mm, lo inyectas aquí:
                    // fechaSalida: '2026-08-27T22:40' 
                };

                onImportComplete(datosFormateados);
                
                // Limpiar input para permitir subir el mismo archivo después si hay error
                if (fileInputRef.current) fileInputRef.current.value = '';

            } catch (error) {
                console.error("Error leyendo Excel:", error);
                alert("Error al leer el archivo. Asegúrese de usar el formato oficial.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div>
            <input 
                type="file" 
                accept=".xlsx, .xls" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                id="excel-upload"
            />
            <label 
                htmlFor="excel-upload" 
                className="bg-emerald-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2 text-xs uppercase tracking-widest cursor-pointer"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Importar Plantilla
            </label>
        </div>
    );
};

export default ExcelImporter;