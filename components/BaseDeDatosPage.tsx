import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';
import { ProyectoDB, ProductoDB, ClienteDB, EstatusDB, BrockerDB, EscalaDB, SucursalDB, LineaTransporteDB, UnidadTransporteDB, TipoUnidad, User, UserRole } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, ChevronDownIcon, DatabaseIcon, BoxIcon, MapPinIcon, MapIcon, EyeIcon, TruckIcon } from './icons';
import ConfirmModal from './ConfirmModal';
import { toCamelCase, toSnakeCase } from '../utils/formatters';
import { useNotification } from './NotificationProvider';
import StaffOnDuty from './StaffOnDuty';

// MI DIOS: Visualizador CSS de Radar para indicar cobertura relativa
const GeofenceRadar: React.FC<{ radius: number }> = ({ radius }) => {
    const sizePercent = Math.max(20, Math.min(100, (radius / 2000) * 100));
    return (
        <div className="relative w-8 h-8 flex items-center justify-center bg-primary/5 rounded-full border border-primary/10 overflow-hidden shrink-0">
            <div className="absolute w-1 h-1 bg-primary rounded-full z-10"></div>
            <div 
                className="absolute border border-primary/30 rounded-full animate-ping"
                style={{ width: `${sizePercent}%`, height: `${sizePercent}%` }}
            ></div>
            <div 
                className="absolute bg-primary/10 rounded-full border border-primary/20"
                style={{ width: `${sizePercent}%`, height: `${sizePercent}%` }}
            ></div>
        </div>
    );
};

// MI DIOS: Mapa dinámico interactivo con soporte para selección (Picker)
const GeofenceMap: React.FC<{ 
    lat?: number, 
    lng?: number, 
    radius: number, 
    title: string,
    isPicker?: boolean,
    onLocationPicked?: (lat: number, lng: number) => void
}> = ({ lat, lng, radius, title, isPicker, onLocationPicked }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const circleRef = useRef<any>(null);
    const markerRef = useRef<any>(null);

    useEffect(() => {
        if (!mapContainerRef.current || !(window as any).L) return;

        const L = (window as any).L;
        const center = [lat || 19.4326, lng || -99.1332];

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapContainerRef.current, {
                zoomControl: true,
                attributionControl: false
            }).setView(center, lat ? 16 : 5);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstanceRef.current);
            
            circleRef.current = L.circle(center, {
                color: '#002D62',
                fillColor: '#002D62',
                fillOpacity: 0.2,
                radius: radius
            }).addTo(mapInstanceRef.current);

            markerRef.current = L.marker(center).addTo(mapInstanceRef.current).bindPopup(title);

            // MI DIOS: Habilitar clic para capturar coordenadas si es modo Picker
            if (isPicker) {
                mapInstanceRef.current.on('click', (e: any) => {
                    const { lat, lng } = e.latlng;
                    onLocationPicked?.(lat, lng);
                });
                mapContainerRef.current.style.cursor = 'crosshair';
            }
        } else {
            if (lat && lng) {
                mapInstanceRef.current.setView(center);
                circleRef.current.setLatLng(center);
                circleRef.current.setRadius(radius);
                markerRef.current.setLatLng(center).getPopup().setContent(title);
            }
            // Forzar refresco visual de Leaflet para evitar áreas grises en modales
            setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
        }
    }, [lat, lng, radius, title, isPicker, onLocationPicked]);

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
                <span className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></div>
                    {isPicker ? 'Haga clic para situar geocerca' : 'Vista de Detección'}
                </span>
                <span className="text-[10px] font-bold text-text-muted italic">Leaflet Engine</span>
            </div>
            <div ref={mapContainerRef} className="h-48 md:h-56 w-full rounded-2xl border border-border shadow-inner z-0 overflow-hidden bg-surface-secondary"></div>
        </div>
    );
};

type DataItem = ProyectoDB | ProductoDB | ClienteDB | EstatusDB | BrockerDB | EscalaDB | LineaTransporteDB | UnidadTransporteDB | TipoUnidad;

interface SubTabColumn {
    key: string;
    name: string;
    type?: string;
    group?: string;
    groupClassName?: string;
    headerClassName?: string;
    className?: string;
    hideInTable?: boolean;
    optionsSource?: string; // Para campos tipo SELECT dinámicos
    options?: string[]; // JEFE: Para campos tipo SELECT fijos
    placeholder?: string;
}

interface SubTabInfo {
    name: string;
    columns: SubTabColumn[];
    table: string;
}

interface MainTabInfo {
    name: string;
    subTabs: {
        [key: string]: SubTabInfo;
    };
}

const COMMON_SUBTABS_CONFIG = {
    proyecto: {
        name: 'Proyecto',
        columns: [
            { key: 'nombre', name: 'Nombre' },
            { key: 'direccion', name: 'Dirección Base', className: 'max-w-[150px] truncate', headerClassName: 'max-w-[150px]' },
            { key: 'radioGeocercaMetros', name: 'Geocerca (m)', type: 'number', headerClassName: 'w-24 text-center' },
            { key: 'tiempoOptimo', name: 'Tiempo Óptimo (hrs)', type: 'number', headerClassName: 'w-32 text-center' },
            { key: 'tiempoTolerable', name: 'Tiempo Tolerable (hrs)', type: 'number', headerClassName: 'w-32 text-center' },
            { key: 'mapsLink', name: 'Ubicación', type: 'link' },
            { key: 'lat', name: 'Latitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true },
            { key: 'lng', name: 'Longitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true },
            { key: 'capacidadCargaPallets', name: 'Capacidad Máx. Pallets', type: 'number', group: 'Configuración Logística', hideInTable: true }
        ]
    },
    productos: {
        name: 'Productos',
        columns: [
            { key: 'nombreDelProducto', name: 'Producto', headerClassName: 'w-1/4' },
            { key: 'categoria', name: 'Categoría', group: 'Nombres', hideInTable: true },
            { key: 'limiteTolerable', name: 'Límite Tol.', headerClassName: 'w-24 text-center' },
            { key: 'tempOptima', name: 'Temp. Opt. (°F)', type: 'number', headerClassName: 'w-24 text-center' },
            { key: 'cajasPalletUsa', name: 'Cjs/Pallet', type: 'number', headerClassName: 'w-24 text-center' },
            { key: 'almacenadoFrio', name: 'Frío', type: 'boolean', headerClassName: 'w-16 text-center' },
            { key: 'puedeConsolidar', name: 'Consolida', type: 'boolean', headerClassName: 'w-16 text-center' },
            { key: 'aliasUsa', name: 'Alias USA', group: 'Nombres', groupClassName: 'bg-primary text-primary-content', hideInTable: true },
            { key: 'configUsa', name: 'Configuración', group: 'Especificaciones', groupClassName: 'bg-accent text-white', hideInTable: true },
            { key: 'pesoUsa', name: 'Peso Neto (kg)', group: 'Especificaciones', type: 'number', hideInTable: true },
            { key: 'limiteSuperior', name: 'Límite Sup (°F)', group: 'Rango Térmico', groupClassName: 'bg-info text-white', hideInTable: true },
            { key: 'color', name: 'Color', group: 'Insumos', type: 'color', groupClassName: 'bg-success text-white', hideInTable: true },
            { key: 'nombreInsumo', name: 'Insumo (Caja)', group: 'Insumos', hideInTable: true },
            { key: 'gastoCaja', name: 'Gasto Caja ($)', group: 'Insumos', type: 'number', hideInTable: true },
            { key: 'etiqueta', name: 'Etiqueta', group: 'Insumos', hideInTable: true },
            { key: 'gastoEtiqueta', name: 'Gasto Etiqueta ($)', group: 'Insumos', type: 'number', hideInTable: true },
            { key: 'fleje', name: 'Fleje', group: 'Insumos', hideInTable: true },
            { key: 'gastoFleje', name: 'Gasto Fleje ($)', group: 'Insumos', type: 'number', hideInTable: true, placeholder: 'Costo total por 27m (1 Pallet)' },
            { key: 'tarima', name: 'Tarima', group: 'Insumos', hideInTable: true },
            { key: 'gastoTarima', name: 'Gasto Tarima ($/Unidad)', group: 'Insumos', type: 'number', hideInTable: true },
        ]
    },
    clientes: {
        name: 'Clientes',
        columns: [
            { key: 'nombre', name: 'Nombre' },
            { key: 'direccion', name: 'Dirección' },
            { key: 'radioGeocercaMetros', name: 'Perímetro Arribo (m)', type: 'number' },
            { key: 'lat', name: 'Latitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true },
            { key: 'lng', name: 'Longitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true }
        ]
    },
    estatus: {
        name: 'Estatus',
        columns: [
            { key: 'nombre', name: 'Nombre' },
            { key: 'color', name: 'Color', type: 'color' }
        ]
    },
    escalas: {
        name: 'Escalas',
        columns: [{ key: 'nombre', name: 'Nombre de la Escala' }]
    }
};

const DATABASE_CONFIG: { [key: string]: MainTabInfo } = {
    estados_unidos: {
        name: 'Estados Unidos',
        subTabs: {
            proyecto: { ...COMMON_SUBTABS_CONFIG.proyecto, table: 'usa_proyectos' },
            productos: { ...COMMON_SUBTABS_CONFIG.productos, table: 'usa_productos' },
            clientes: { ...COMMON_SUBTABS_CONFIG.clientes, table: 'usa_clientes' },
            lineas_transporte: {
                name: 'Líneas Transporte',
                table: 'usa_lineas_transporte',
                columns: [
                    { key: 'nombre', name: 'Línea Transportista' },
                    { key: 'contactoEmergencia', name: 'Contacto 24/7' }
                ]
            },
            tipo_unidad: {
                name: 'Tipos de Unidad',
                table: 'tipo_unidad',
                columns: [
                    { key: 'unidad', name: 'Tipo de Unidad' },
                    { key: 'capacidad', name: 'Capacidad Configurada' }
                ]
            },
            unidades_transporte: {
                name: 'Unidades Flota',
                table: 'usa_unidades_transporte',
                columns: [
                    { key: 'lineaId', name: 'ID Línea (UUID)', group: 'Vínculo Maestro', optionsSource: 'usa_lineas_transporte' },
                    { key: 'numeroEconomico', name: 'No. Económico' },
                    { key: 'placasTractor', name: 'Placas Tractor' },
                    { key: 'placasCaja', name: 'Placas Caja' },
                    { 
                        key: 'tipoUnidad', 
                        name: 'Configuración', 
                        group: 'Atributos',
                        options: ['Thermo 53 pies', 'Thermo 48 pies', 'Torton', 'Rabón', 'Camioneta 3.5 Ton'] // JEFE: Lista cerrada para evitar errores
                    }
                ]
            },
            estatus: { ...COMMON_SUBTABS_CONFIG.estatus, table: 'usa_estatus' },
            alertas_tive: { 
                name: 'Config. Tive', 
                table: 'tive_alert_config', 
                columns: [
                    { key: 'trackerId', name: 'ID Tracker (K...)' },
                    { key: 'tempMin', name: 'Mín (°F)', type: 'number' },
                    { key: 'tempMax', name: 'Máx (°F)', type: 'number' },
                    { key: 'enableMovementAlerts', name: 'Movimiento', type: 'boolean' },
                    { key: 'enableStopAlerts', name: 'Paradas', type: 'boolean' },
                    { key: 'cooldownMinutes', name: 'Refresco (min)', type: 'number' }
                ] 
            },
            brocker: { name: 'Brocker', table: 'usa_brockers', columns: [{ key: 'nombre', name: 'Nombre' }] },
            escalas: { ...COMMON_SUBTABS_CONFIG.escalas, table: 'usa_escalas' },
            responsable: {
                name: 'Responsable de Turno',
                table: 'usa_responsables',
                columns: [
                    { key: 'nombre', name: 'Nombre' },
                    { key: 'puesto', name: 'Puesto' },
                    { key: 'horarioAtencion', name: 'Horario de Atención' },
                    { key: 'correo', name: 'Correo Electrónico' },
                    { key: 'numeroWhatsapp', name: 'WhatsApp' }
                ]
            }
        }
    }
};

interface BaseDeDatosPageProps {
    user: User;
}

const BaseDeDatosPage: React.FC<BaseDeDatosPageProps> = ({ user }) => {
    const { addNotification } = useNotification();
    const canManageDatabase = [UserRole.ADMINISTRADOR, UserRole.GERENCIA].includes(user.role);
    const mainTabKeys = Object.keys(DATABASE_CONFIG);
    const [activeMainTabKey, setActiveMainTabKey] = useState(mainTabKeys[0]);
    const [activeSubTabKey, setActiveSubTabKey] = useState(Object.keys(DATABASE_CONFIG[activeMainTabKey].subTabs)[0]);
    const [tableData, setTableData] = useState<DataItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState<DataItem | null>(null);
    const [itemToDelete, setItemToDelete] = useState<DataItem | null>(null);
    const currentSubTabInfo = DATABASE_CONFIG[activeMainTabKey].subTabs[activeSubTabKey];

    const [allProducts, setAllProducts] = useState<ProductoDB[]>([]);
    const [projectProductLinks, setProjectProductLinks] = useState<Record<string, ProductoDB[]>>({});
    const [projectSucursales, setProjectSucursales] = useState<Record<string, SucursalDB[]>>({});
    const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

    const ensureDatabaseWriteAccess = () => {
        if (canManageDatabase) return true;
        addNotification({
            type: 'warning',
            title: 'Acceso Restringido',
            message: 'Tu rol solo tiene acceso de consulta en esta base de datos.'
        });
        return false;
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from(currentSubTabInfo.table).select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setTableData(toCamelCase(data) as DataItem[]);

            if (activeSubTabKey === 'productos' && activeMainTabKey === 'estados_unidos') {
                setAllProducts(toCamelCase(data) as ProductoDB[]);
            }
            
            if (activeSubTabKey !== 'productos' && activeMainTabKey === 'estados_unidos') {
                const { data: prods } = await supabase.from('usa_productos').select('*');
                if (prods) setAllProducts(toCamelCase(prods) as ProductoDB[]);
            }

        } catch (error) {
            console.error(`Error fetching:`, error);
            setTableData([]);
        } finally {
            setLoading(false);
        }
    }, [currentSubTabInfo.table, activeSubTabKey, activeMainTabKey]);

    useEffect(() => {
        fetchData();
        setExpandedRows(new Set());
    }, [fetchData]);

    const fetchProjectDetails = async (projectId: string) => {
        setLoadingLinks(projectId);
        try {
            const { data: prodData } = await supabase
                .from('usa_proyecto_producto')
                .select(`producto_id, usa_productos(*)`)
                .eq('proyecto_id', projectId);
            
            if (prodData) {
                const products = prodData.map((d: any) => toCamelCase(d.usa_productos)) as ProductoDB[];
                setProjectProductLinks(prev => ({ ...prev, [projectId]: products }));
            }

            const { data: sucData } = await supabase
                .from('usa_sucursales')
                .select('*')
                .eq('proyecto_id', projectId)
                .order('es_principal', { ascending: false });

            if (sucData) {
                setProjectSucursales(prev => ({ ...prev, [projectId]: toCamelCase(sucData) }));
            }
        } catch (error) {
            console.error("Error al cargar detalles del proyecto", error);
        } finally {
            setLoadingLinks(null);
        }
    };

    const handleAddSucursal = async (projectId: string, nombre: string, direccion: string, radio: number) => {
        if (!ensureDatabaseWriteAccess()) return;
        if (!nombre || !direccion) return;
        try {
            const { error } = await supabase.from('usa_sucursales').insert({
                proyecto_id: projectId,
                nombre_sucursal: nombre,
                direccion: direccion,
                radio_geocerca_metros: radio
            });
            if (error) throw error;
            addNotification({ type: 'success', title: 'Sucursal Registrada', message: 'El punto de carga ha sido añadido con su geocerca.' });
            await fetchProjectDetails(projectId);
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo registrar la sucursal.' });
        }
    };

    const handleDeleteSucursal = async (projectId: string, sucursalId: string) => {
        if (!ensureDatabaseWriteAccess()) return;
        try {
            const { error } = await supabase.from('usa_sucursales').delete().eq('id', sucursalId);
            if (error) throw error;
            await fetchProjectDetails(projectId);
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo eliminar.' });
        }
    }

    const handleLinkProduct = async (projectId: string, productoId: string) => {
        if (!ensureDatabaseWriteAccess()) return;
        if (!productoId) return;
        try {
            const { error } = await supabase.from('usa_proyecto_producto').insert({
                proyecto_id: projectId,
                producto_id: productoId
            });
            if (error) throw error;
            await fetchProjectDetails(projectId);
        } catch (error: any) {
            addNotification({ type: 'warning', title: 'Error de Vínculo', message: 'El producto ya está vinculado o hubo un error.' });
        }
    };

    const handleUnlinkProduct = async (projectId: string, productoId: string) => {
        if (!ensureDatabaseWriteAccess()) return;
        try {
            const { error } = await supabase
                .from('usa_proyecto_producto')
                .delete()
                .eq('proyecto_id', projectId)
                .eq('producto_id', productoId);
            
            if (error) throw error;
            
            setProjectProductLinks(prev => ({
                ...prev,
                [projectId]: prev[projectId].filter(p => p.id !== productoId)
            }));
        } catch (error) {
            addNotification({ type: 'danger', title: 'Error', message: 'No se pudo desvincular el producto.' });
        }
    };

    const handleMainTabClick = (mainKey: string) => {
        setActiveMainTabKey(mainKey);
        setActiveSubTabKey(Object.keys(DATABASE_CONFIG[mainKey].subTabs)[0]);
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else {
                next.add(id);
                if (activeSubTabKey === 'proyecto' && activeMainTabKey === 'estados_unidos') {
                    fetchProjectDetails(id);
                }
            }
            return next;
        });
    };

    const handleOpenForm = (item: DataItem | null = null) => {
        if (!ensureDatabaseWriteAccess()) return;
        setCurrentItem(item);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setCurrentItem(null);
    };

    const handleOpenDeleteModal = (item: DataItem) => {
        setItemToDelete(item);
        setIsDeleteModalOpen(true);
    };

    const handleCloseDeleteModal = () => {
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
    };

    const handleSubmit = async (formData: any) => {
        if (!ensureDatabaseWriteAccess()) return;
        try {
            const isEditing = currentItem && 'id' in currentItem;
            const { id, created_at, ...data } = formData;
            
            Object.keys(data).forEach(key => { if (data[key] === '') data[key] = null; });
            const dataToSave = toSnakeCase(data);
            
            if (isEditing) {
                const { error } = await supabase.from(currentSubTabInfo.table).update(dataToSave).eq('id', (currentItem as any).id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(currentSubTabInfo.table).insert(dataToSave);
                if (error) throw error;
            }
            
            addNotification({ type: 'success', title: 'Registro Guardado', message: 'La información se ha sincronizado correctamente.' });
            fetchData();
            handleCloseForm();
        } catch (error: any) {
            addNotification({ 
                type: 'danger', 
                title: 'Error de Esquema', 
                message: `No se pudo guardar: ${error.message}.` 
            });
        }
    };

    const confirmDelete = async () => {
        if (!ensureDatabaseWriteAccess()) return;
        if (!itemToDelete) return;
        try {
            const { error } = await supabase.from(currentSubTabInfo.table).delete().eq('id', (itemToDelete as any).id);
            if (error) throw error;
            fetchData();
        } finally {
            handleCloseDeleteModal();
        }
    };

    const visibleColumns = currentSubTabInfo.columns.filter(c => !c.hideInTable);
    const hiddenColumns = currentSubTabInfo.columns.filter(c => c.hideInTable);
    const hasHiddenColumns = hiddenColumns.length > 0 || (activeSubTabKey === 'proyecto' && activeMainTabKey === 'estados_unidos');

    return (
        <div className="animate-fade-in pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mb-6">
                <div className="lg:col-span-2 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Base de Datos Logística</h1>
                    <div className="flex gap-3">
                        <button onClick={() => handleOpenForm()} disabled={!canManageDatabase} className="flex items-center space-x-2 bg-primary text-primary-content px-5 py-2.5 rounded-xl font-bold hover:bg-primary-focus transition-all shadow-md active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            <PlusIcon className="w-5 h-5" />
                            <span className="inline">Añadir Registro</span>
                        </button>
                    </div>
                </div>
                <StaffOnDuty />
            </div>

            <div className="border-b border-border mb-4 overflow-x-auto no-scrollbar">
                <nav className="-mb-px flex space-x-6">
                    {mainTabKeys.map(key => (
                        <button key={key} onClick={() => handleMainTabClick(key)} className={`whitespace-nowrap pb-3 px-1 border-b-2 font-black text-sm uppercase tracking-wider transition-colors ${activeMainTabKey === key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
                            {DATABASE_CONFIG[key].name}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="bg-surface-secondary/30 rounded-lg p-2 mb-6 overflow-x-auto custom-scrollbar">
                <nav className="flex space-x-2 whitespace-nowrap">
                    {Object.entries(DATABASE_CONFIG[activeMainTabKey].subTabs).map(([key, subTab]) => (
                        <button key={key} onClick={() => setActiveSubTabKey(key)} className={`py-2 px-4 rounded-md font-bold text-xs uppercase tracking-tighter transition-all ${activeSubTabKey === key ? 'bg-surface shadow-sm text-primary' : 'text-text-secondary hover:bg-surface/50 hover:text-text-primary'}`}>
                            {subTab.name}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="mt-6">
                {loading ? (
                    <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                ) : (
                    <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-text-secondary responsive-table">
                                <thead className="text-[10px] text-text-secondary uppercase font-black bg-surface-secondary/50 border-b border-border tracking-widest">
                                    <tr>
                                        {hasHiddenColumns && <th className="w-12 px-4 py-2"></th>}
                                        {visibleColumns.map(col => <th key={col.key} className={`px-4 py-2 font-black whitespace-nowrap ${col.headerClassName || ''}`}>{col.name}</th>)}
                                        <th className="px-4 py-2 text-center font-black w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {tableData.length === 0 ? (
                                        <tr><td colSpan={visibleColumns.length + (hasHiddenColumns ? 2 : 1)} className="p-12 text-center text-text-muted italic">No hay registros almacenados.</td></tr>
                                    ) : (
                                        tableData.map((item: any) => {
                                            const isExpanded = expandedRows.has(item.id);
                                            return (
                                                <React.Fragment key={item.id}>
                                                    <tr className={`hover:bg-hover transition-colors ${isExpanded ? 'bg-surface-secondary/20 border-l-4 border-primary' : 'border-l-4 border-transparent'}`}>
                                                        {hasHiddenColumns && (
                                                            <td className="px-4 py-1.5 text-center">
                                                                <button onClick={() => toggleRow(item.id)} className="p-1 rounded-full hover:bg-surface-secondary/50 text-text-muted hover:text-primary transition-colors">
                                                                    <ChevronDownIcon className={`w-3.5 h-3.5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                                </button>
                                                            </td>
                                                        )}
                                                        {visibleColumns.map(col => (
                                                            <td key={col.key} data-label={col.name} className={`px-4 py-1.5 text-text-primary font-bold align-middle whitespace-nowrap ${col.className || ''}`}>
                                                                {col.type === 'boolean' ? (
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${item[col.key] ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>{item[col.key] ? 'Sí' : 'No'}</span>
                                                                ) : col.type === 'color' ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-4 h-4 rounded-full border border-border shadow-sm" style={{backgroundColor: item[col.key]}}></div>
                                                                        <span className="text-[10px] font-mono">{item[col.key]}</span>
                                                                    </div>
                                                                ) : col.type === 'link' ? (
                                                                    item[col.key] ? <a href={item[col.key]} target="_blank" rel="noopener" className="text-primary text-[10px] font-bold underline uppercase">Mapa</a> : <span className="text-[9px] italic text-text-muted">N/A</span>
                                                                ) : col.key === 'radioGeocercaMetros' ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <GeofenceRadar radius={item[col.key] || 500} />
                                                                        <span className="font-black text-xs">{item[col.key]}m</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs">{item[col.key] || '-'}</span>
                                                                )}
                                                            </td>
                                                        ))}
                                                        <td className="px-4 py-1.5 text-center align-middle" data-label="Acciones">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={() => toggleRow(item.id)} className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors" title="Ver Detalles"><EyeIcon className="w-3.5 h-3.5" /></button>
                                                                <button onClick={() => handleOpenForm(item)} className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors"><PencilIcon className="w-3.5 h-3.5" /></button>
                                                                <button onClick={() => handleOpenDeleteModal(item)} className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"><TrashIcon className="w-3.5 h-3.5" /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr className="bg-surface-secondary/10">
                                                            <td colSpan={visibleColumns.length + 2} className="px-4 pb-6 pt-2 border-b border-border/50">
                                                                <div className="flex flex-col gap-6">
                                                                    {activeSubTabKey === 'proyecto' && activeMainTabKey === 'estados_unidos' && (
                                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                                                                            <div className="bg-white p-4 rounded-2xl border border-border shadow-lg ring-1 ring-black/5">
                                                                                <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                                                                                    <MapPinIcon className="w-3.5 h-3.5" /> 
                                                                                    Puntos de Carga / Sucursales
                                                                                </h4>
                                                                                <div className="space-y-3">
                                                                                    <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                                                                                        <div className="grid grid-cols-1 gap-2">
                                                                                            <input id={`new-suc-name-${item.id}`} type="text" placeholder="Nombre..." className="w-full bg-white border border-border rounded px-2 py-1 text-[11px] font-bold outline-none" />
                                                                                            <input id={`new-suc-dir-${item.id}`} type="text" placeholder="Dirección..." className="w-full bg-white border border-border rounded px-2 py-1 text-[11px] font-bold outline-none" />
                                                                                            <button onClick={() => {
                                                                                                const n = (document.getElementById(`new-suc-name-${item.id}`) as HTMLInputElement).value;
                                                                                                const d = (document.getElementById(`new-suc-dir-${item.id}`) as HTMLInputElement).value;
                                                                                                handleAddSucursal(item.id, n, d, 500);
                                                                                                (document.getElementById(`new-suc-name-${item.id}`) as HTMLInputElement).value = '';
                                                                                                (document.getElementById(`new-suc-dir-${item.id}`) as HTMLInputElement).value = '';
                                                                                            }} className="w-full bg-primary text-primary-content py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:bg-primary-focus shadow-md">Guardar Punto</button>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                                                        {projectSucursales[item.id]?.map(suc => (
                                                                                            <div key={suc.id} className="flex justify-between items-center p-2 bg-background rounded-lg border border-border group hover:border-primary/30 transition-all">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <GeofenceRadar radius={suc.radioGeocercaMetros} />
                                                                                                    <div>
                                                                                                        <span className="text-[10px] font-black text-primary">{suc.nombreSucursal}</span>
                                                                                                        <p className="text-[8px] text-text-muted font-medium truncate max-w-[200px]">{suc.direccion}</p>
                                                                                                    </div>
                                                                                                </div>
                                                                                                {!suc.esPrincipal && <button onClick={() => handleDeleteSucursal(item.id, suc.id)} className="p-1 text-text-muted hover:text-danger rounded hover:bg-danger/10"><TrashIcon className="w-3 h-3" /></button>}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="bg-white p-4 rounded-2xl border border-border shadow-lg ring-1 ring-black/5">
                                                                                <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                                                                                    <BoxIcon className="w-3.5 h-3.5" /> 
                                                                                    Vínculos de Producto
                                                                                </h4>
                                                                                <div className="space-y-4">
                                                                                    <select className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs font-bold outline-none focus:border-primary appearance-none" onChange={(e) => { if (e.target.value) { handleLinkProduct(item.id, e.target.value); e.target.value = ""; } }}>
                                                                                        <option value="">Seleccionar Producto...</option>
                                                                                        {allProducts.filter(p => !(projectProductLinks[item.id] || []).some(lp => lp.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.nombreDelProducto}</option>)}
                                                                                    </select>
                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                        {projectProductLinks[item.id]?.map(p => (
                                                                                            <div key={p.id} className="bg-primary/5 text-primary border border-primary/20 pl-3 pr-1 py-0.5 rounded-full flex items-center gap-2 text-[9px] font-black group">{p.nombreDelProducto}<button onClick={() => handleUnlinkProduct(item.id, p.id)} className="p-0.5 hover:bg-danger text-text-muted hover:text-white rounded-full transition-all"><TrashIcon className="w-2.5 h-2.5" /></button></div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <DetailView item={item} columns={hiddenColumns} />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {isFormOpen && <DataFormModal tabInfo={currentSubTabInfo as SubTabInfo} item={currentItem} onSubmit={handleSubmit} onClose={handleCloseForm} />}
            <ConfirmModal isOpen={isDeleteModalOpen} onClose={handleCloseDeleteModal} onConfirm={confirmDelete} title="Confirmar Eliminación" message="¿Eliminar registro permanentemente de la base de datos?" />
        </div>
    );
};

const DetailView: React.FC<{ item: any, columns: SubTabColumn[] }> = ({ item, columns }) => {
    const allDetailCols = useMemo(() => {
        const baseCols = [...columns];
        if (!baseCols.some(c => c.key === 'direccion')) {
            baseCols.unshift({ key: 'direccion', name: 'Dirección Base' });
        }
        return baseCols;
    }, [columns]);

    const grouped = useMemo(() => {
        const groups: Record<string, { className: string, cols: SubTabColumn[] }> = {};
        allDetailCols.forEach(col => {
            const groupName = col.group || 'Atributos Técnicos';
            if (!groups[groupName]) groups[groupName] = { className: col.groupClassName || 'bg-surface-secondary text-text-primary', cols: [] };
            groups[groupName].cols.push(col);
        });
        return groups;
    }, [allDetailCols]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in flex-1">
            {Object.entries(grouped).map(([groupName, data]) => {
                const groupData = data as { className: string; cols: SubTabColumn[] };
                return (
                    <div key={groupName} className="bg-white rounded-xl border border-border overflow-hidden shadow-sm flex flex-col">
                        <div className={`px-3 py-1.5 font-black text-[9px] uppercase tracking-widest ${groupData.className} border-b border-black/5`}>{groupName}</div>
                        <div className="p-3 space-y-2 flex-1">
                            {groupData.cols.map(col => (
                                <div key={col.key} className="flex flex-col border-b border-border/40 last:border-0 pb-1">
                                    <span className="text-[8px] text-text-muted font-bold uppercase tracking-wider mb-0.5">{col.name}</span>
                                    <span className="text-[11px] font-black text-text-primary">
                                        {col.type === 'boolean' ? (
                                            item[col.key] ? 'Activado' : 'Desactivado'
                                        ) : col.type === 'color' ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full border border-border shadow-sm" style={{backgroundColor: item[col.key]}}></div>
                                                <span className="text-[10px] font-mono">{item[col.key] || '--'}</span>
                                            </div>
                                        ) : (
                                            item[col.key] || '--'
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const DataFormModal: React.FC<{ tabInfo: SubTabInfo, item: DataItem | null, onSubmit: (data: any) => void, onClose: () => void }> = ({ tabInfo, item, onSubmit, onClose }) => {
    const [formData, setFormData] = useState<any>({});
    const [isLocating, setIsLocating] = useState(false);
    const [optionsData, setOptionsData] = useState<Record<string, any[]>>({});
    const { addNotification } = useNotification();

    useEffect(() => {
        if (item) setFormData(item);
        else {
            const emptyForm: any = {};
            tabInfo.columns.forEach(col => { emptyForm[col.key] = col.type === 'boolean' ? false : col.type === 'number' ? (col.key === 'radioGeocercaMetros' ? 500 : 0) : ''; });
            setFormData(emptyForm);
        }

        tabInfo.columns.forEach(col => {
            if (col.optionsSource) {
                supabase.from(col.optionsSource).select('*').then(({ data }) => {
                    if (data) setOptionsData(prev => ({ ...prev, [col.key]: toCamelCase(data) }));
                });
            }
        });
    }, [item, tabInfo]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData((prev: any) => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : type === 'number' ? parseFloat(value) || 0 : value,
        }));
    };

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            addNotification({ type: 'warning', title: 'GPS no soportado', message: 'Su navegador no permite geolocalización.' });
            return;
        }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setFormData({ ...formData, lat: pos.coords.latitude, lng: pos.coords.longitude });
                setIsLocating(false);
                addNotification({ type: 'success', title: 'GPS Sincronizado', message: 'Coordenadas capturadas.' });
            },
            () => {
                setIsLocating(false);
                addNotification({ type: 'danger', title: 'Error de GPS', message: 'No se pudo obtener su ubicación.' });
            }
        );
    };

    const groups = useMemo(() => {
        const g: Record<string, SubTabColumn[]> = { 'Información Principal': [] };
        const orderedKeys: string[] = ['Información Principal'];
        tabInfo.columns.forEach(col => {
            const groupName = col.group || 'Información Principal';
            if (!g[groupName]) { g[groupName] = []; orderedKeys.push(groupName); }
            g[groupName].push(col);
        });
        return { groups: g, keys: orderedKeys };
    }, [tabInfo.columns]);

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/80 z-[200] flex justify-center items-center p-4 backdrop-blur-sm">
            <div className="bg-surface md:rounded-2xl w-[92vw] md:max-w-5xl flex flex-col border border-border max-h-[80vh] md:max-h-[90vh] animate-fade-in shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-border flex justify-between items-center bg-primary text-primary-content shrink-0">
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-tight">{item ? 'Actualizar' : 'Registrar'} {tabInfo.name}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form id="data-form" onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="p-6 md:p-8 overflow-y-auto custom-scrollbar bg-background/30 flex-1">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            {groups.keys.map(groupName => (
                                <div key={groupName} className="animate-fade-in">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 pb-1.5 border-b border-primary/20 text-primary">{groupName}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {groups.groups[groupName].map(col => (
                                            <div key={col.key} className="flex flex-col">
                                                <label className="text-[9px] font-black text-text-muted uppercase tracking-wider mb-1">{col.name}</label>
                                                {col.type === 'boolean' ? (
                                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-border">
                                                        <input type="checkbox" name={col.key} id={`cb-${col.key}`} checked={!!formData[col.key]} onChange={handleChange} className="w-4 h-4 text-primary border-gray-300 rounded" />
                                                        <label htmlFor={`cb-${col.key}`} className="text-xs font-bold text-text-primary cursor-pointer">Habilitar</label>
                                                    </div>
                                                ) : col.optionsSource ? (
                                                    <select 
                                                        name={col.key} 
                                                        value={formData[col.key] || ''} 
                                                        onChange={handleChange}
                                                        className="w-full bg-white border border-border rounded px-3 py-1.5 text-xs font-bold text-primary outline-none"
                                                    >
                                                        <option value="">Seleccione...</option>
                                                        {optionsData[col.key]?.map(opt => (
                                                            <option key={opt.id} value={opt.id}>{opt.nombre || opt.nombreDelProducto || opt.id}</option>
                                                        ))}
                                                    </select>
                                                ) : col.options ? ( 
                                                    <select 
                                                        name={col.key} 
                                                        value={formData[col.key] || ''} 
                                                        onChange={handleChange}
                                                        className="w-full bg-white border border-border rounded px-3 py-1.5 text-xs font-bold text-primary outline-none"
                                                        required
                                                    >
                                                        <option value="">Seleccione {col.name}...</option>
                                                        {col.options.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input 
                                                        type={col.type === 'number' ? 'number' : 'text'} 
                                                        name={col.key} 
                                                        value={formData[col.key] || ''} 
                                                        onChange={handleChange} 
                                                        className="w-full bg-white border border-border rounded px-3 py-1.5 text-xs font-bold text-primary outline-none"
                                                        placeholder={col.placeholder || `Ingresar ${col.name.toLowerCase()}...`}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {(formData.radioGeocercaMetros !== undefined || formData.lat) && (
                            <div className="lg:col-span-1 space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">GPS</h4>
                                    <button 
                                        type="button"
                                        onClick={handleGetLocation}
                                        disabled={isLocating}
                                        className="text-[9px] font-black text-primary border border-primary/30 px-2 py-1 rounded bg-white hover:bg-primary/5"
                                    >
                                        {isLocating ? '...' : 'Mi GPS'}
                                    </button>
                                </div>
                                <GeofenceMap 
                                    lat={formData.lat} 
                                    lng={formData.lng} 
                                    radius={formData.radioGeocercaMetros || 500} 
                                    title={formData.nombre || 'Selección'}
                                    isPicker={true}
                                    onLocationPicked={(lat, lng) => setFormData({...formData, lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6))})}
                                />
                            </div>
                        )}
                    </div>
                </form>
                
                <div className="p-4 border-t border-border flex flex-col md:flex-row justify-end gap-3 bg-surface shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
                    <button type="button" onClick={onClose} className="py-2 px-6 rounded-xl font-bold text-xs text-text-secondary hover:bg-hover transition-all">Cancelar</button>
                    <button type="submit" form="data-form" className="bg-primary text-primary-content py-2.5 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-primary-focus transition-all active:scale-95">Guardar Configuración</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default BaseDeDatosPage;
