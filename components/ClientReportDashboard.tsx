import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toCamelCase, toSnakeCase } from '../utils/formatters';
import Card from './ui/Card';
import { DownloadIcon, PencilIcon, TrashIcon, ExclamationIcon, ChartBarIcon, BoxIcon } from './icons';
import { useNotification } from './NotificationProvider';
import ConfirmModal from './ConfirmModal';
import { UserRole } from '../types';
import ReactDOM from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface ExecutiveData {
  id: string;
  categoria: string;
  nombreDelProducto: string;
  ventaNg2025: number;
  presupuesto: number;
  proyeccionCajas: number;
  realAcumulado: number;
  sourceIds?: string[];
}

interface ProjectPerformance {
  id: string;
  name: string;
  proyeccion: number;
  real: number;
  cumplimiento: number;
}

const getPercent = (num: number, den: number): number => {
  if (!den || den === 0) return 0;
  return Math.round((num / den) * 100);
};

const CATEGORY_ORDER = ['ALOE', 'Cebollas', 'Chiles', 'Chiles Speciality', 'Exoticos', 'Otros Vegetales', 'Tomates'];
const PRODUCT_ORDER_MAP: Record<string, string[]> = {
  'Cebollas': ['Cebolla amarilla', 'Cebolla blanca'],
  'Chiles': ['Anaheim', 'Caribe', 'Hungaro', 'Jalapeño rojo', 'Jalapeño Verde', 'Poblano', 'Serrano'],
  'Chiles Speciality': ['Chile de Arbol', 'Chiltepin', 'Green Thai', 'Red Fresno'],
  'Exoticos': ['Higos', 'Jicama'],
  'Otros Vegetales': ['Elote amarillo dulce', 'Elote blanco mexicano', 'Tomatillo S/Cascara', 'Ajo Morado'],
  'Tomates': ['Tomate Roma']
};

const getWeekNumber = (d: Date): number => {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

function getCurrentWeek(): number {
  return getWeekNumber(new Date());
}

const ClientReportDashboard: React.FC = () => {
  const { addNotification } = useNotification();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeWeek, setActiveWeek] = useState<number>(getCurrentWeek());
  const [data, setData] = useState<ExecutiveData[]>([]);
  const [projectPerformance, setProjectPerformance] = useState<ProjectPerformance[]>([]);
  const [logisticsQualityData, setLogisticsQualityData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table');
  const [reportMode, setReportMode] = useState<'auto' | 'cierre' | 'proyeccion'>('auto');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [useDateRange, setUseDateRange] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ExecutiveData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('ng_auth_profile');
    if (savedUser) setUserRole(JSON.parse(savedUser).role);
    fetchData();
  }, [activeWeek, dateRange, useDateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, shipmentRes, prodsRes, projectsRes] = await Promise.all([
        useDateRange 
          ? supabase.from('proyecciones_estrategicas').select('*').gte('semana_fiscal', getWeekNumber(new Date(dateRange.start))).lte('semana_fiscal', getWeekNumber(new Date(dateRange.end)))
          : supabase.from('proyecciones_estrategicas').select('*').eq('semana_fiscal', activeWeek),
        supabase.from('usa_shipment_reports').select('*'),
        supabase.from('usa_productos').select('*'),
        supabase.from('usa_proyectos').select('*')
      ]);

      if (projRes.error) throw projRes.error;
      if (shipmentRes.error) throw shipmentRes.error;

      const products = prodsRes.data || [];
      const projects = projectsRes.data || [];
      const productStats: Record<string, number> = {};
      const projectRealStats: Record<string, number> = {};
      
      // Calculate Real from shipments
      shipmentRes.data?.forEach(report => {
        const depDate = report.real_departure_date || report.departure_date_time;
        if (!depDate) return;
        
        const d = new Date(depDate);
        if (useDateRange) {
            const start = new Date(dateRange.start);
            const end = new Date(dateRange.end);
            end.setHours(23, 59, 59, 999);
            if (d < start || d > end) return;
        } else {
            if (getWeekNumber(d) !== activeWeek) return;
        }

        let shipmentTotal = 0;
        (report.products || []).forEach((p: any) => {
          const pid = p.product_id || p.productId;
          const qty = Number(p.real_qty || p.realQty || p.quantity || 0);
          productStats[pid] = (productStats[pid] || 0) + qty;
          shipmentTotal += qty;
        });

        if (report.project_id) {
          projectRealStats[report.project_id] = (projectRealStats[report.project_id] || 0) + shipmentTotal;
        }
      });

      // Aggregate for main table
      const aggregated: Record<string, ExecutiveData> = {};
      const productTotalsAdded: Record<string, Set<string>> = {};

      // Aggregate for projects
      const projAgg: Record<string, { proyeccion: number, real: number, name: string }> = {};
      projects.forEach(p => {
          projAgg[p.id] = { proyeccion: 0, real: projectRealStats[p.id] || 0, name: p.nombre };
      });

      (projRes.data || []).forEach(p => {
        const prod = products.find((pr: any) => pr.id === p.producto_id);
        const cat = prod?.categoria || 'Sin Categoría';
        const name = prod?.nombre_del_producto || 'Desconocido';
        const key = `${cat}_${name}`;

        if (!aggregated[key]) {
          aggregated[key] = {
            id: p.id,
            categoria: cat,
            nombreDelProducto: name,
            ventaNg2025: 0,
            presupuesto: 0,
            proyeccionCajas: 0,
            realAcumulado: 0,
            sourceIds: []
          };
          productTotalsAdded[key] = new Set();
        }

        aggregated[key].ventaNg2025 += Number(p.venta_2025_referencia || p.venta_ng2025 || 0);
        aggregated[key].presupuesto += Number(p.presupuesto_monetario || p.presupuesto || 0);
        aggregated[key].proyeccionCajas += Number(p.proyeccion_cajas || 0);
        aggregated[key].sourceIds?.push(p.id);
        
        if (!productTotalsAdded[key].has(p.producto_id)) {
          aggregated[key].realAcumulado += (productStats[p.producto_id] || 0);
          productTotalsAdded[key].add(p.producto_id);
        }

        // Project aggregations
        if (p.proyecto_id && projAgg[p.proyecto_id]) {
            projAgg[p.proyecto_id].proyeccion += Number(p.proyeccion_cajas || 0);
        }
      });

      setData(Object.values(aggregated));
      setProjectPerformance(Object.entries(projAgg).map(([id, info]) => ({
          id,
          name: info.name,
          proyeccion: info.proyeccion,
          real: info.real,
          cumplimiento: info.proyeccion > 0 ? Math.round((info.real / info.proyeccion) * 100) : 0
      })).filter(p => p.proyeccion > 0 || p.real > 0));

      // Calculate Logistics and Quality KPIs
      const qualityStats = {
          transit: { tolerable: 0, nonTolerable: 0 },
          temp: { correct: 0, outOfRange: 0 }
      };

      shipmentRes.data?.forEach(report => {
          const depDate = report.real_departure_date || report.departure_date_time;
          const arrDate = report.arrival_date_time;
          
          if (depDate && arrDate) {
              const diffHours = (new Date(arrDate).getTime() - new Date(depDate).getTime()) / (1000 * 60 * 60);
              if (diffHours <= 72) qualityStats.transit.tolerable++;
              else qualityStats.transit.nonTolerable++;
          }

          // Quality/Temp check
          const ideal = Number(report.ideal_temp || report.temperature || 0);
          const real = Number(report.arrival_temp || 0); // Placeholder for final temp audit
          if (ideal > 0 && real > 0) {
              if (Math.abs(real - ideal) <= 4) qualityStats.temp.correct++;
              else qualityStats.temp.outOfRange++;
          }
      });
      setLogisticsQualityData(qualityStats);

    } catch (e: any) {
      console.error("Error in fetchData:", e);
      addNotification({ type: 'danger', title: 'Error de BD', message: e.message || 'No se pudo leer la base de datos.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const effectiveMode = reportMode === 'auto' ? (globalTotals.real > 0 ? 'cierre' : 'proyeccion') : reportMode;
    const isCierre = effectiveMode === 'cierre';
    
    const headers = isCierre 
        ? ["Categoria", "Producto", "Ref 2025", "Presupuesto", "Proyeccion", "Real Cajas", "% Confiabilidad"]
        : ["Categoria", "Producto", "Ref 2025", "Presupuesto", "Proyeccion", "Alc. Ppto", "Alc. Venta"];
        
    const rows = data.map(d => {
      const basic = [d.categoria, d.nombreDelProducto, d.ventaNg2025, d.presupuesto, d.proyeccionCajas];
      if (isCierre) {
          return [...basic, d.realAcumulado, `${d.proyeccionCajas > 0 ? Math.round((d.realAcumulado / d.proyeccionCajas) * 100) : 0}%`];
      } else {
          const alcPpto = d.presupuesto > 0 ? Math.round((d.proyeccionCajas / d.presupuesto) * 100) : 0;
          const alcVenta = d.ventaNg2025 > 0 ? Math.round((d.proyeccionCajas / d.ventaNg2025) * 100) : 0;
          return [...basic, `${alcPpto}%`, `${alcVenta}%`];
      }
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Matriz_Ejecutiva_W${activeWeek}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addNotification({ type: 'success', title: 'Exportación CSV', message: 'Archivo descargado.' });
  };

  const handleExportPDF = () => {
    addNotification({ type: 'info', title: 'Generando Reporte', message: 'Preparando vista de impresión corporativa...' });
    let rowsHtml = '';
    const effectiveMode = reportMode === 'auto' ? (globalTotals.real > 0 ? 'cierre' : 'proyeccion') : reportMode;
    const isCierre = effectiveMode === 'cierre';
    const pdfColumnCount = isCierre ? 8 : 6;

    sortedGroupedData.forEach(([cat, items]) => {
      const categoryRef2025 = items.reduce((acc, curr) => acc + curr.ventaNg2025, 0);
      const categoryPresupuesto = items.reduce((acc, curr) => acc + curr.presupuesto, 0);
      const categoryProyeccion = items.reduce((acc, curr) => acc + curr.proyeccionCajas, 0);
      const categoryReal = items.reduce((acc, curr) => acc + curr.realAcumulado, 0);
      const categoryAlcPpto = getPercent(categoryProyeccion, categoryPresupuesto);
      const categoryAlcVenta = getPercent(categoryProyeccion, categoryRef2025);
      const categoryConfiabilidad = getPercent(categoryReal, categoryProyeccion);

      rowsHtml += `<tr class="category-row"><td colspan="${pdfColumnCount}">${cat}</td></tr>`;
      rowsHtml += `
	        <tr class="category-total-row">
	          <td>Total ${cat}</td>
	          <td style="text-align: center;">${categoryRef2025.toLocaleString()}</td>
	          <td style="text-align: center;">${categoryPresupuesto.toLocaleString()}</td>
	          <td style="text-align: center;">${categoryProyeccion.toLocaleString()}</td>
	          ${isCierre ? `
	            <td style="text-align: center;">${categoryReal.toLocaleString()}</td>
	            <td style="text-align: center; color: ${getComplianceColor(categoryConfiabilidad)};">${categoryConfiabilidad}%</td>
	            <td style="text-align: center; color: ${getComplianceColor(categoryAlcPpto)};">${categoryAlcPpto}%</td>
	            <td style="text-align: center; color: ${categoryAlcVenta >= 100 ? '#15803D' : '#B91C1C'};">${categoryAlcVenta}%</td>
	          ` : `
	            <td style="text-align: center; color: ${getComplianceColor(categoryAlcPpto)};">${categoryAlcPpto}%</td>
	            <td style="text-align: center; color: ${categoryAlcVenta >= 100 ? '#15803D' : '#B91C1C'};">${categoryAlcVenta}%</td>
	          `}
	        </tr>
      `;

      items.forEach(item => {
        const alcPpto = getPercent(item.proyeccionCajas, item.presupuesto);
        const alcVenta = getPercent(item.proyeccionCajas, item.ventaNg2025);
        const confiabilidad = getPercent(item.realAcumulado, item.proyeccionCajas);

        rowsHtml += `
	          <tr>
	            <td style="font-weight: 700; color: #1E293B;">${item.nombreDelProducto}</td>
	            <td style="text-align: center; color: #334155;">${item.ventaNg2025.toLocaleString()}</td>
	            <td style="text-align: center; color: #334155;">${item.presupuesto.toLocaleString()}</td>
	            <td style="text-align: center; font-weight: 700; color: #0F172A;">${item.proyeccionCajas.toLocaleString()}</td>
	            ${isCierre ? `
	              <td style="text-align: center; font-weight: 900; color: #002D62;">${item.realAcumulado.toLocaleString()}</td>
	              <td style="text-align: center; font-weight: 900; color: ${getComplianceColor(confiabilidad)};">${confiabilidad}%</td>
	              <td style="text-align: center; font-weight: 900; color: ${getComplianceColor(alcPpto)};">${alcPpto}%</td>
	              <td style="text-align: center; font-weight: 900; color: ${alcVenta >= 100 ? '#15803D' : '#B91C1C'};">${alcVenta}%</td>
	            ` : `
	              <td style="text-align: center; font-weight: 900; color: ${getComplianceColor(alcPpto)};">${alcPpto}%</td>
	              <td style="text-align: center; font-weight: 900; color: ${alcVenta >= 100 ? '#15803D' : '#B91C1C'};">${alcVenta}%</td>
	            `}
	          </tr>
        `;
      });
    });

    const totalAlcPpto = getPercent(globalTotals.proyeccion, globalTotals.presupuesto);
    const totalAlcVenta = getPercent(globalTotals.proyeccion, globalTotals.ref2025);
    const totalConfiabilidad = getPercent(globalTotals.real, globalTotals.proyeccion);
    const html = `<html>
      <head>
        <title>NGLOBAL_${isCierre ? 'Cierre' : 'Proyeccion'}_W${activeWeek}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #002D62; padding-bottom: 20px; margin-bottom: 30px; }
          .header-content h1 { margin: 0; color: #002D62; font-size: 28px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
          .header-content p { margin: 5px 0 0 0; color: #475569; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; }
          .logo { height: 80px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 2px solid #e2e8f0; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
          th { background: #002D62; color: white; padding: 12px; text-align: left; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
          tr:last-child td { border-bottom: none; }
          .category-row td { background-color: #dbeafe; font-weight: 900; color: #001F44; font-size: 12px; border-top: 2px solid #93c5fd; border-bottom: 2px solid #93c5fd; }
          .category-total-row td { background-color: #eff6ff; font-weight: 900; color: #0F172A; }
          .grand-total-row td { background: #001F44; color: white; font-weight: 900; border-top: 3px solid #002D62; }
          .footer { margin-top: 40px; text-align: center; font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 900; letter-spacing: 1px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <h1>REPORTE EJECUTIVO - SEMANA ${activeWeek}</h1>
            <p>NGLOBAL LOGISTICS - PERFORMANCE ESTRATÉGICO</p>
          </div>
          <img src="https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg" alt="NGLOBAL Logo" class="logo" />
        </div>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align: center;">Ref 2025</th>
              <th style="text-align: center;">Presupuesto</th>
              <th style="text-align: center;">Proyección</th>
	              ${isCierre ? `
	                <th style="text-align: center;">Real Cajas</th>
	                <th style="text-align: center;">% Alcance</th>
	              ` : `
	                <th style="text-align: center;">Alc. Ppto</th>
	                <th style="text-align: center;">Alc. Venta</th>
	              `}
	              ${isCierre ? `
	                <th style="text-align: center;">Alc. Ppto</th>
	                <th style="text-align: center;">Alc. Venta</th>
	              ` : ''}
	            </tr>
          </thead>
	          <tbody>
	            ${rowsHtml}
	            <tr class="grand-total-row">
	              <td>TOTAL GENERAL</td>
	              <td style="text-align: center;">${globalTotals.ref2025.toLocaleString()}</td>
	              <td style="text-align: center;">${globalTotals.presupuesto.toLocaleString()}</td>
	              <td style="text-align: center;">${globalTotals.proyeccion.toLocaleString()}</td>
	              ${isCierre ? `
	                <td style="text-align: center;">${globalTotals.real.toLocaleString()}</td>
	                <td style="text-align: center;">${totalConfiabilidad}%</td>
	                <td style="text-align: center;">${totalAlcPpto}%</td>
	                <td style="text-align: center;">${totalAlcVenta}%</td>
	              ` : `
	                <td style="text-align: center;">${totalAlcPpto}%</td>
	                <td style="text-align: center;">${totalAlcVenta}%</td>
	              `}
	            </tr>
	          </tbody>
        </table>
        <div class="footer">
          NGLOBAL LOGISTICS OPERATIONS CENTER • DOC GENERADO AUTOMÁTICAMENTE EL ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
        </div>
      </body>
    </html>`;
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed'; printIframe.style.opacity = '0';
    document.body.appendChild(printIframe);
    const doc = printIframe.contentWindow?.document;
    if (doc) { doc.open(); doc.write(html); doc.close(); setTimeout(() => { printIframe.contentWindow?.focus(); printIframe.contentWindow?.print(); document.body.removeChild(printIframe); }, 500); }
  };

  const globalTotals = useMemo(() => {
    return {
      ref2025: data.reduce((acc, curr) => acc + (Number(curr.ventaNg2025) || 0), 0),
      presupuesto: data.reduce((acc, curr) => acc + (Number(curr.presupuesto) || 0), 0),
      proyeccion: data.reduce((acc, curr) => acc + (Number(curr.proyeccionCajas) || 0), 0),
      real: data.reduce((acc, curr) => acc + (Number(curr.realAcumulado) || 0), 0)
    };
  }, [data]);

  const globalPercentage = useMemo(() => getPercent(globalTotals.real, globalTotals.proyeccion), [globalTotals]);

  const globalRealVSRef = useMemo(() => getPercent(globalTotals.real, globalTotals.ref2025), [globalTotals]);

  const globalRealVSPpto = useMemo(() => getPercent(globalTotals.real, globalTotals.presupuesto), [globalTotals]);

  const globalProyVSPpto = useMemo(() => getPercent(globalTotals.proyeccion, globalTotals.presupuesto), [globalTotals]);

  const globalProyVSRef = useMemo(() => getPercent(globalTotals.proyeccion, globalTotals.ref2025), [globalTotals]);

  const effectiveMode = reportMode === 'auto' ? (globalTotals.real > 0 ? 'cierre' : 'proyeccion') : reportMode;

  const sortedGroupedData = useMemo(() => {
    const groups: Record<string, ExecutiveData[]> = {};
    data.forEach(item => {
      if (!groups[item.categoria]) groups[item.categoria] = [];
      groups[item.categoria].push(item);
    });
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a);
      const indexB = CATEGORY_ORDER.indexOf(b);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });
    const result: [string, ExecutiveData[]][] = [];
    sortedCategories.forEach(cat => {
      const items = groups[cat];
      const orderList = PRODUCT_ORDER_MAP[cat] || [];
      const sortedItems = items.sort((a, b) => {
        const idxA = orderList.indexOf(a.nombreDelProducto);
        const idxB = orderList.indexOf(b.nombreDelProducto);
        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
      });
      result.push([cat, sortedItems]);
    });
    return result;
  }, [data]);

  const chartDataByCategory = useMemo(() => {
    return sortedGroupedData.map(([cat, items]) => {
      const proyeccion = items.reduce((acc, curr) => acc + (Number(curr.proyeccionCajas) || 0), 0);
      const real = items.reduce((acc, curr) => acc + (Number(curr.realAcumulado) || 0), 0);
      return {
        name: cat,
        proyeccion,
        real,
        cumplimiento: proyeccion > 0 ? Math.round((real / proyeccion) * 100) : 0
      };
    }).filter(c => c.proyeccion > 0);
  }, [sortedGroupedData]);

  const handleUpdate = async (formData: any) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('proyecciones_estrategicas')
        .update({
          venta_2025_referencia: formData.ventaNg2025,
          presupuesto_monetario: formData.presupuesto,
          proyeccion_cajas: formData.proyeccionCajas
        })
        .eq('id', selectedItem?.id);

      if (error) throw error;
      addNotification({ type: 'success', title: 'Cambios Guardados', message: 'La base estratégica ha sido actualizada.' });
      fetchData();
      setIsEditModalOpen(false);
    } catch (e) {
      addNotification({ type: 'danger', title: 'Error de Guardado', message: 'No se pudo actualizar el registro.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const idsToDelete = selectedItem?.sourceIds && selectedItem.sourceIds.length > 0
        ? selectedItem.sourceIds
        : [selectedItem?.id];

      const { error } = await supabase.from('proyecciones_estrategicas').delete().in('id', idsToDelete as string[]);
      if (error) throw error;
      addNotification({ type: 'success', title: 'Registro Eliminado', message: 'La meta global ha sido borrada del sistema.' });
      fetchData();
      setIsDeleteModalOpen(false);
      setSelectedItem(null);
    } catch (e) {
      addNotification({ type: 'danger', title: 'Error', message: 'No se pudo eliminar.' });
    }
  };

  const getComplianceColor = (percent: number) => percent >= 95 ? '#16A34A' : percent >= 80 ? '#D97706' : '#DC2626';
  const getComplianceBg = (percent: number) => percent >= 95 ? '#F0FDF4' : percent >= 80 ? '#FFFBEB' : '#FEF2F2';

  const renderPercent = (num: number, den: number, isVentaTarget = false) => {
    if (!den || den === 0) return <div className="text-slate-700 font-bold text-[9px] bg-slate-200/80 py-0.5 rounded">0%</div>;
    const percent = getPercent(num, den);
    const color = isVentaTarget ? (percent >= 100 ? '#16A34A' : '#DC2626') : getComplianceColor(percent);
    const bg = isVentaTarget ? (percent >= 100 ? '#F0FDF4' : '#FEF2F2') : getComplianceBg(percent);
    
    return <div className="px-1.5 py-0.5 rounded text-center font-black text-[10px]" style={{ backgroundColor: bg, color: color }}>{percent}%</div>;
  };

  const canEdit = [UserRole.SUBDIRECCION, UserRole.DIRECCION, UserRole.LIDER_PROYECTO, UserRole.ADMINISTRADOR].includes(userRole as UserRole);

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-border shadow-sm gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#002D62] rounded-xl flex items-center justify-center text-white text-xl font-black">NG</div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tighter uppercase">Matriz Ejecutiva</h1>
            <p className="text-xs font-bold text-text-secondary uppercase italic">Performance Estratégico - W{activeWeek}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2 mr-2">
            <button onClick={handleExportCSV} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-black uppercase text-primary transition-all flex items-center gap-1"><DownloadIcon className="w-3.5 h-3.5" /> CSV</button>
            <button onClick={handleExportPDF} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-black uppercase text-primary transition-all flex items-center gap-1"><DownloadIcon className="w-3.5 h-3.5" /> PDF</button>
          </div>
          <div className="flex items-center gap-6 border-x border-border px-4 py-1">
            {effectiveMode === 'cierre' ? (
              <>
                <div className="text-right">
                  <span className="block text-[8px] font-black text-text-muted uppercase tracking-widest">Confiabilidad Real vs Proy.</span>
                  <span className="text-xl font-black" style={{ color: getComplianceColor(globalPercentage) }}>{globalPercentage}%</span>
                </div>
                <div className="text-right">
                  <span className="block text-[8px] font-black text-text-muted uppercase tracking-widest">Global Real vs 2025</span>
                  <span className="text-xl font-black" style={{ color: getComplianceColor(globalRealVSRef) }}>{globalRealVSRef}%</span>
                </div>
                <div className="text-right">
                  <span className="block text-[8px] font-black text-text-muted uppercase tracking-widest">Global vs Ppto.</span>
                  <span className="text-2xl font-black leading-none" style={{ color: getComplianceColor(globalRealVSPpto) }}>{globalRealVSPpto}%</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-right">
                  <span className="block text-[8px] font-black text-text-muted uppercase tracking-widest">Alcance Venta (Proy vs 2025)</span>
                  <span className="text-xl font-black" style={{ color: globalProyVSRef >= 100 ? '#16A34A' : '#DC2626' }}>{globalProyVSRef}%</span>
                </div>
                <div className="text-right">
                  <span className="block text-[8px] font-black text-text-muted uppercase tracking-widest">Alcance Presupuesto (Proy)</span>
                  <span className="text-xl font-black" style={{ color: getComplianceColor(globalProyVSPpto) }}>{globalProyVSPpto}%</span>
                </div>
                <div className="text-right bg-primary/5 px-2 py-1 rounded-lg">
                  <span className="block text-[8px] font-black text-primary uppercase tracking-widest">Modo Proyección</span>
                  <span className="text-xs font-black text-primary italic">Planificando Semana</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="inline-flex bg-surface-secondary/50 p-1 rounded-2xl border border-border shadow-inner ml-2">
        <button
          onClick={() => setActiveTab('table')}
          className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.1em] transition-all ${activeTab === 'table' ? 'bg-primary text-white shadow-md' : 'text-text-secondary hover:bg-white/50'}`}
        >
          <BoxIcon className="w-4 h-4" /> Matriz Datos
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.1em] transition-all ${activeTab === 'charts' ? 'bg-primary text-white shadow-md' : 'text-text-secondary hover:bg-white/50'}`}
        >
          <ChartBarIcon className="w-4 h-4" /> Análisis Gráfico
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-border mt-2 shadow-sm">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setUseDateRange(false)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${!useDateRange ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:bg-white/50'}`}
              >
                Por Semana
              </button>
              <button 
                onClick={() => setUseDateRange(true)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${useDateRange ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:bg-white/50'}`}
              >
                Por Rango
              </button>
          </div>
          
          {!useDateRange ? (
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-black text-text-muted uppercase">Semana Fiscal</label>
                <input type="number" value={activeWeek} onChange={(e) => setActiveWeek(parseInt(e.target.value) || 1)} className="w-16 bg-white border border-border rounded-lg py-1.5 text-center font-black text-primary outline-none" />
              </div>
          ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <label className="text-[9px] font-black text-text-muted uppercase">Desde</label>
                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="bg-white border border-border rounded-lg px-2 py-1.5 text-[10px] font-black text-primary outline-none" />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-[9px] font-black text-text-muted uppercase">Hasta</label>
                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="bg-white border border-border rounded-lg px-2 py-1.5 text-[10px] font-black text-primary outline-none" />
                </div>
              </div>
          )}
      </div>

      <div className="inline-flex bg-surface-secondary/50 p-1 rounded-2xl border border-border shadow-inner ml-2">
        <button
          onClick={() => setReportMode('auto')}
          className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${reportMode === 'auto' ? 'bg-[#002D62] text-white shadow-sm' : 'text-text-secondary hover:bg-white/50'}`}
        >
          Auto (Smart)
        </button>
        <button
          onClick={() => setReportMode('cierre')}
          className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${reportMode === 'cierre' ? 'bg-green-600 text-white shadow-sm' : 'text-text-secondary hover:bg-white/50'}`}
        >
          Cierre Semanal
        </button>
        <button
          onClick={() => setReportMode('proyeccion')}
          className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all ${reportMode === 'proyeccion' ? 'bg-blue-600 text-white shadow-sm' : 'text-text-secondary hover:bg-white/50'}`}
        >
          Matriz Proyección
        </button>
      </div>

      {activeTab === 'table' ? (
        <Card className="p-0 overflow-hidden border-2 border-[#002D62] shadow-2xl relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Sincronizando...</span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#002D62] text-white text-[10px] uppercase font-black tracking-widest">
                  <th className="px-6 py-3">Categoría / Producto</th>
                  <th className="px-4 py-3 text-center">Referencia 2025</th>
                  <th className="px-4 py-3 text-center">Presupuesto</th>
                  <th className="px-4 py-3 text-center">Proyección</th>
                  {effectiveMode === 'cierre' ? (
                    <>
                      <th className="px-4 py-3 text-center">Real Cajas</th>
                      <th className="px-4 py-3 text-center">% Confiabilidad</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-center">Alc. Ppto</th>
                      <th className="px-4 py-3 text-center">Alc. Venta (Critico)</th>
                    </>
                  )}
                  {canEdit && <th className="px-4 py-3 text-center bg-accent/20">Control</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedGroupedData.map(([cat, items]) => (
                  <React.Fragment key={cat}>
                    <tr className="bg-[#001F44] text-white font-black text-[10px] uppercase shadow-sm">
                      <td className="px-6 py-2.5">{cat}</td>
                      <td className="px-4 py-2.5 text-center">{items.reduce((acc, curr) => acc + curr.ventaNg2025, 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center">{items.reduce((acc, curr) => acc + curr.presupuesto, 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center">{items.reduce((acc, curr) => acc + curr.proyeccionCajas, 0).toLocaleString()}</td>
                      {effectiveMode === 'cierre' ? (
                        <>
                          <td className="px-4 py-2.5 text-center text-blue-200">{items.reduce((acc, curr) => acc + curr.realAcumulado, 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5">{renderPercent(items.reduce((acc, curr) => acc + curr.realAcumulado, 0), items.reduce((acc, curr) => acc + curr.proyeccionCajas, 0))}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5">{renderPercent(items.reduce((acc, curr) => acc + curr.proyeccionCajas, 0), items.reduce((acc, curr) => acc + curr.presupuesto, 0))}</td>
                          <td className="px-4 py-2.5">{renderPercent(items.reduce((acc, curr) => acc + curr.proyeccionCajas, 0), items.reduce((acc, curr) => acc + curr.ventaNg2025, 0), true)}</td>
                        </>
                      )}
                      {canEdit && <td className="bg-accent/5"></td>}
                    </tr>
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-hover transition-colors text-[10px] font-bold">
                        <td className="px-10 py-1.5 text-text-primary border-l-4 border-l-primary/10">{item.nombreDelProducto}</td>
                        <td className="px-4 py-1.5 text-center text-text-muted">{item.ventaNg2025.toLocaleString()}</td>
                        <td className="px-4 py-1.5 text-center text-text-muted">{item.presupuesto.toLocaleString()}</td>
                        <td className="px-4 py-1.5 text-center">{item.proyeccionCajas.toLocaleString()}</td>
                        {effectiveMode === 'cierre' ? (
                          <>
                            <td className="px-4 py-1.5 text-center font-black text-[#002D62]">{item.realAcumulado.toLocaleString()}</td>
                            <td className="px-4 py-1.5">{renderPercent(item.realAcumulado, item.proyeccionCajas)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-1.5">{renderPercent(item.proyeccionCajas, item.presupuesto)}</td>
                            <td className="px-4 py-1.5">{renderPercent(item.proyeccionCajas, item.ventaNg2025, true)}</td>
                          </>
                        )}
                        {canEdit && (
                          <td className="px-4 py-1.5 text-center bg-accent/5">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => { setSelectedItem(item); setIsEditModalOpen(true); }} className="p-1 text-primary hover:bg-primary/10 rounded transition-colors" title="Editar"><PencilIcon className="w-3.5 h-3.5" /></button>
                              <button onClick={() => { setSelectedItem(item); setIsDeleteModalOpen(true); }} className="p-1 text-danger hover:bg-danger/10 rounded transition-colors" title="Eliminar"><TrashIcon className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        )}
                      </tr>
	                    ))}
	                  </React.Fragment>
	                ))}
	                <tr className="bg-[#000F24] text-white text-[10px] font-black uppercase tracking-wide">
	                  <td className="px-6 py-3">Total General</td>
	                  <td className="px-4 py-3 text-center">{globalTotals.ref2025.toLocaleString()}</td>
	                  <td className="px-4 py-3 text-center">{globalTotals.presupuesto.toLocaleString()}</td>
	                  <td className="px-4 py-3 text-center">{globalTotals.proyeccion.toLocaleString()}</td>
	                  {effectiveMode === 'cierre' ? (
	                    <>
	                      <td className="px-4 py-3 text-center text-blue-100">{globalTotals.real.toLocaleString()}</td>
	                      <td className="px-4 py-3">{renderPercent(globalTotals.real, globalTotals.proyeccion)}</td>
	                    </>
	                  ) : (
	                    <>
	                      <td className="px-4 py-3">{renderPercent(globalTotals.proyeccion, globalTotals.presupuesto)}</td>
	                      <td className="px-4 py-3">{renderPercent(globalTotals.proyeccion, globalTotals.ref2025, true)}</td>
	                    </>
	                  )}
	                  {canEdit && <td className="bg-white/5"></td>}
	                </tr>
	              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-12 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card title="Eficiencia de Producción por Sede / Proyecto" className="lg:col-span-2 border-2 border-primary/20 shadow-xl">
               <div className="p-6 bg-primary/[0.02] border-b border-border mb-6">
                 <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Análisis de Desempeño Operativo</p>
                 <h4 className="text-xs text-text-secondary font-bold italic">Comparativa de Proyectado vs Real Auditado (Enviado).</h4>
               </div>
               <div className="h-[450px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={projectPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, angle: -45, textAnchor: 'end' }} interval={0} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                     <Tooltip 
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                        formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                     />
                     <Legend wrapperStyle={{ paddingTop: '50px', fontSize: '11px', fontWeight: '900' }} />
                     <Bar dataKey="proyeccion" name="Proyectado (Azul)" fill="#2563EB" radius={[6, 6, 0, 0]} barSize={35} />
                     <Bar dataKey="real" name="Real Auditado (Verde)" fill="#16A34A" radius={[6, 6, 0, 0]} barSize={35} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </Card>

            <Card title="Cumplimiento por Categoría (%)">
               <div className="p-4 bg-gray-50 border-b mb-4">
                  <p className="text-[9px] font-black text-text-muted uppercase tracking-widest text-center">Referencia de Cumplimiento de Metas</p>
               </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataByCategory} layout="vertical" margin={{ top: 20, right: 50, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800 }} width={120} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      formatter={(value: number, name: string) => [name === 'cumplimiento' ? `${value}%` : value.toLocaleString(), name === 'cumplimiento' ? 'Cumplimiento' : 'Absoluto']}
                    />
                    <Bar dataKey="cumplimiento" radius={[0, 4, 4, 0]} barSize={25}>
                      {chartDataByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getComplianceColor(entry.cumplimiento)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Distribución de Peso (Solo Real)">
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartDataByCategory.filter(c => c.real > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="real"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    >
                      {chartDataByCategory.filter(c => c.real > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#002D62', '#1E3A8A', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD'][index % 6]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Cajas Reales']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center mt-4">
                  <p className="text-[10px] font-black text-text-muted uppercase">Cálculo basado exclusivamente en Real Auditado</p>
              </div>
            </Card>

            <div className="lg:col-span-2 mt-8">
              <div className="flex items-center gap-3 mb-6 bg-[#002D62] p-4 rounded-2xl text-white">
                 <BoxIcon className="w-6 h-6" />
                 <div>
                    <h3 className="text-lg font-black uppercase tracking-widest">Módulos de Logística y Calidad</h3>
                    <p className="text-[10px] font-bold opacity-80 uppercase italic">Control de Tránsito y Temperaturas (Auditoría en Destino)</p>
                 </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <Card title="Tiempos en Tránsito">
                    <div className="h-[300px]">
                       <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                             <Pie
                                data={[
                                   { name: 'Tolerable (≤72h)', value: logisticsQualityData?.transit.tolerable || 0, color: '#16A34A' },
                                   { name: 'No Tolerable (>72h)', value: logisticsQualityData?.transit.nonTolerable || 0, color: '#DC2626' }
                                ]}
                                cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value"
                             >
                                {[0,1].map((entry, i) => (
                                   <Cell key={`cell-${i}`} fill={i === 0 ? '#16A34A' : '#DC2626'} />
                                ))}
                             </Pie>
                             <Tooltip />
                             <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900' }} />
                          </PieChart>
                       </ResponsiveContainer>
                    </div>
                 </Card>

                 <Card title="Control de Temperaturas">
                    <div className="h-[300px]">
                       <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                             <Pie
                                data={[
                                   { name: 'Rango Correcto', value: logisticsQualityData?.temp.correct || 0, color: '#16A34A' },
                                   { name: 'Fuera de Rango', value: logisticsQualityData?.temp.outOfRange || 0, color: '#DC2626' }
                                ]}
                                cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value"
                             >
                                {[0,1].map((entry, i) => (
                                   <Cell key={`cell-${i}`} fill={i === 0 ? '#16A34A' : '#DC2626'} />
                                ))}
                             </Pie>
                             <Tooltip />
                             <Legend wrapperStyle={{ fontSize: '10px', fontWeight: '900' }} />
                          </PieChart>
                       </ResponsiveContainer>
                    </div>
                 </Card>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && selectedItem && (
        <QuickEditModal
          item={selectedItem}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleUpdate}
          saving={saving}
        />
      )}

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Confirmación de Borrado"
        message={`¿Desea eliminar permanentemente la meta estratégica de ${selectedItem?.nombreDelProducto}?`}
      />
    </div>
  );
};

const QuickEditModal = ({ item, onClose, onSave, saving }: any) => {
  const [form, setForm] = useState({ ...item });
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/80 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-border">
        <div className="bg-primary p-5 text-white flex justify-between items-center">
          <h3 className="font-black uppercase tracking-widest text-sm">Editar Meta Ejecutiva</h3>
          <button onClick={onClose}><ExclamationIcon className="w-5 h-5 rotate-45" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-[10px] font-black text-primary uppercase border-b pb-2">{item.nombreDelProducto}</p>
          <div>
            <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Referencia 2025 (Cajas)</label>
            <input type="number" className="w-full bg-background border p-2 rounded-lg font-bold outline-none" value={form.ventaNg2025} onChange={e => setForm({ ...form, ventaNg2025: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Presupuesto Cajas</label>
            <input type="number" className="w-full bg-background border p-2 rounded-lg font-bold outline-none" value={form.presupuesto} onChange={e => setForm({ ...form, presupuesto: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[9px] font-black text-text-muted uppercase mb-1 block">Proyección Cajas</label>
            <input type="number" className="w-full bg-background border p-2 rounded-lg font-black text-primary outline-none" value={form.proyeccionCajas} onChange={e => setForm({ ...form, proyeccionCajas: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 py-3 font-bold text-text-muted hover:bg-gray-100 rounded-xl transition-all">Cancelar</button>
            <button onClick={() => onSave(form)} disabled={saving} className="flex-1 py-3 bg-primary text-white font-black uppercase rounded-xl shadow-lg active:scale-95 transition-all">{saving ? '...' : 'Sincronizar'}</button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
};

export default ClientReportDashboard;
