// MI DIOS: DICCIONARIO MAESTRO DE ESQUEMAS (Phoenix Schema Engine v1.0)
// Jefe, este es el único lugar donde se definen las columnas de la DB.

export interface SubTabColumn {
    key: string;
    name: string;
    type?: string;
    group?: string;
    groupClassName?: string;
    headerClassName?: string;
    className?: string;
    hideInTable?: boolean;
    optionsSource?: string;
    options?: string[];
}

export interface SubTabInfo {
    name: string;
    columns: SubTabColumn[];
    table: string;
}

export interface MainTabInfo {
    name: string;
    subTabs: {
        [key: string]: SubTabInfo;
    };
}

const COMMON_COLUMNS = {
    proyecto: [
        { key: 'nombre', name: 'Nombre' },
        { key: 'direccion', name: 'Dirección Base', className: 'max-w-[150px] truncate', headerClassName: 'max-w-[150px]' },
        { key: 'radioGeocercaMetros', name: 'Geocerca (m)', type: 'number', headerClassName: 'w-24 text-center' },
        { key: 'tiempoOptimo', name: 'Tiempo Óptimo (hrs)', type: 'number', headerClassName: 'w-32 text-center' },
        { key: 'tiempoTolerable', name: 'Tiempo Tolerable (hrs)', type: 'number', headerClassName: 'w-32 text-center' },
        { key: 'mapsLink', name: 'Ubicación', type: 'link' },
        { key: 'lat', name: 'Latitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true },
        { key: 'lng', name: 'Longitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true },
        { key: 'capacidadCargaPallets', name: 'Capacidad Máx. Pallets', type: 'number', group: 'Configuración Logística', hideInTable: true }
    ],
    productos: [
        { key: 'nombreDelProducto', name: 'Producto', headerClassName: 'w-1/4' },
        { key: 'categoria', name: 'Categoría', group: 'Nombres', hideInTable: true },
        { key: 'limiteTolerable', name: 'Límite Tol.', headerClassName: 'w-24 text-center' },
        { key: 'tempOptima', name: 'Temp. Opt. (°F)', type: 'number', headerClassName: 'w-24 text-center' },
        { key: 'cajasPalletUsa', name: 'Cjs/Pallet', type: 'number', headerClassName: 'w-24 text-center' },
        { key: 'almacenadoFrio', name: 'Frío', type: 'boolean', headerClassName: 'w-16 text-center' },
        { key: 'puedeConsolidar', name: 'Consolida', type: 'boolean', headerClassName: 'w-16 text-center' },
        { key: 'aliasUsa', name: 'Alias USA', group: 'Nombres', groupClassName: 'bg-primary text-white', hideInTable: true },
        { key: 'configUsa', name: 'Configuración', group: 'Especificaciones', groupClassName: 'bg-accent text-white', hideInTable: true },
        { key: 'pesoUsa', name: 'Peso Neto (kg)', group: 'Especificaciones', type: 'number', hideInTable: true },
        { key: 'limiteSuperior', name: 'Límite Sup (°F)', group: 'Rango Térmico', groupClassName: 'bg-info text-white', hideInTable: true },
    ]
};

export const DATABASE_CONFIG: { [key: string]: MainTabInfo } = {
    estados_unidos: {
        name: 'Estados Unidos',
        subTabs: {
            proyecto: { name: 'Proyecto', table: 'usa_proyectos', columns: COMMON_COLUMNS.proyecto },
            productos: { name: 'Productos', table: 'usa_productos', columns: COMMON_COLUMNS.productos },
            clientes: {
                name: 'Clientes',
                table: 'usa_clientes',
                columns: [
                    { key: 'nombre', name: 'Nombre' },
                    { key: 'direccion', name: 'Dirección' },
                    { key: 'radioGeocercaMetros', name: 'Perímetro Arribo (m)', type: 'number' },
                    { key: 'lat', name: 'Latitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true },
                    { key: 'lng', name: 'Longitud', type: 'number', group: 'Coordenadas GPS', hideInTable: true }
                ]
            },
            lineas_transporte: {
                name: 'Líneas Transporte',
                table: 'usa_lineas_transporte',
                columns: [
                    { key: 'nombre', name: 'Línea Transportista' },
                    { key: 'contactoEmergencia', name: 'Contacto 24/7' }
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
                    { key: 'tipoUnidad', name: 'Configuración', group: 'Atributos', options: ['Thermo 53 pies', 'Thermo 48 pies', 'Torton', 'Rabón', 'Camioneta 3.5 Ton'] }
                ]
            },
            estatus: { 
                name: 'Estatus', 
                table: 'usa_estatus', 
                columns: [{ key: 'nombre', name: 'Nombre' }, { key: 'color', name: 'Color', type: 'color' }] 
            },
            alertas_tive: { 
                name: 'Config. Tive', 
                table: 'tive_alert_config', 
                columns: [
                    { key: 'trackerId', name: 'ID Tracker' },
                    { key: 'tempMin', name: 'Mín (°F)', type: 'number' },
                    { key: 'tempMax', name: 'Máx (°F)', type: 'number' },
                    { key: 'cooldownMinutes', name: 'Refresco (min)', type: 'number' }
                ] 
            }
        }
    }
};