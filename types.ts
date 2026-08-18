export enum View {
  DASHBOARD = 'DASHBOARD',
  DATABASE = 'DATABASE',
  USA_SHIPMENTS = 'USA_SHIPMENTS',
  LIDER_PROGRAMACION_USA = 'LIDER_PROGRAMACION_USA',
  FRUIT_QUALITY = 'FRUIT_QUALITY',
  STRATEGIC_PLANNING = 'STRATEGIC_PLANNING',
  EXEC_REPORT = 'EXEC_REPORT',
  TIVE_MAP = 'TIVE_MAP',
  SETTINGS = 'SETTINGS',
  FREIGHT_PAYMENTS = 'FREIGHT_PAYMENTS',
  INVENTORY = 'INVENTORY',
  POLICIES = 'POLICIES',
  INSPECTION_QUALITY = 'INSPECTION_QUALITY',
  INSPECTION_DASHBOARD = 'INSPECTION_DASHBOARD',
  INSPECTION_INCIDENTS = 'INSPECTION_INCIDENTS'
}

export enum UserRole {
  DIRECCION = 'DIRECCION',
  SUBDIRECCION = 'SUBDIRECCION',
  LIDER_PROYECTO = 'LIDER_PROYECTO',
  GERENCIA = 'GERENCIA',
  SUBGERENCIA = 'SUBGERENCIA',
  COORDINADOR = 'COORDINADOR',
  ADMINISTRATIVO = 'ADMINISTRATIVO',
  ADMINISTRADOR = 'ADMINISTRADOR',
  INSPECTOR = 'INSPECTOR'
}

// JEFE: Agregamos ShipmentStatus para corregir error en Badge.tsx
export enum ShipmentStatus {
  IN_TRANSIT = 'En Tránsito',
  DELIVERED = 'Entregado',
  DELAYED = 'Retrasado',
  PENDING = 'Pendiente',
  HOLD = 'Hold'
}

export interface User {
  name: string;
  role: UserRole;
  avatar?: string;
}

// JEFE: Agregamos interfaz Message para corregir error en AIAssistant.tsx
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface StrategicProjection extends BaseDBEntity {
  semanaFiscal: number;
  canalVenta: string;
  liderProyectoId?: string;
  proyectoId: string;
  productoId: string;
  clientId?: string; 
  presupuestoMonetario: number;
  venta2023Referencia: number;
  ng_2025: number;
  ss_2025: number;
  precioVenta2025?: number;
  proyeccionCajas: number;
  fechaSalida?: string;
  fechaLlegada?: string;
  totalTarimas?: number;
  camionesCalculados?: number;
  lunes?: number;
  martes?: number;
  miercoles?: number;
  jueves?: number;
  viernes?: number;
  sabado?: number;
  domingo?: number;
  autorizado?: boolean;
  ventaRealManual?: number;
  desgloseDiario?: { fecha: string; cantidad: number }[];
  lineaTransportistaId?: string;
  unidadTransporteId?: string;
  comentariosRechazo?: string;
  canjeProductos?: { productId: string; quantity: number; type?: 'normal' | 'canje' }[]; // Productos adicionales o sustitutos
}

export interface LiderProgramacionUsaReport extends BaseDBEntity {
    loteId: string;
    semanaFiscal: number;
    proyecto: string | string[];
    projectId?: string; 
    clientId?: string; 
    sucursalId?: string;
    area: string;
    fechaSalida: string;
    fechaLlegada?: string;
    pallets: number;
    cajas: number;
    productos: ProductQuantity[];
    usaLogisticsStatus?: string;
    comentarios?: string;
    secondaryProject?: string;
    isConsolidated?: boolean;
    consolidationPartnerId?: string;
    temperaturaIdeal?: number | string | null;
}

export interface BaseDBEntity {
  id: string;
  created_at?: string;
}

export interface SucursalDB extends BaseDBEntity {
    proyectoId: string;
    nombreSucursal: string;
    direccion: string;
    lat?: number;
    lng?: number;
    esPrincipal: boolean;
    radioGeocercaMetros: number;
}

export interface ProyectoDB extends BaseDBEntity {
  nombre: string;
  direccion: string;
  mapsLink?: string; 
  tiempoOptimo?: number; 
  tiempoTolerable?: number;
  capacidadCargaPallets?: number;
  lat?: number;
  lng?: number;
  radioGeocercaMetros: number;
}

export interface LineaTransporteDB extends BaseDBEntity {
  nombre: string;
  contactoEmergencia?: string;
}

export interface UnidadTransporteDB extends BaseDBEntity {
  lineaId: string;
  placasTractor: string;
  placasCaja?: string;
  numeroEconomico?: string;
  tipoUnidad?: string;
}

export interface ProductoDB extends BaseDBEntity {
  nombreDelProducto: string;
  categoria: string;
  aliasUsa?: string;
  configUsa?: string;
  pesoUsa?: number;
  cajasPalletUsa?: number;
  limiteTolerable?: string;
  tempOptima?: number;
  limiteSuperior?: number;
  almacenadoFrio?: boolean;
  puedeConsolidar?: boolean;
  color?: string;
  nombreInsumo?: string;
  etiqueta?: string;
  fleje?: string;
  tarima?: string;
  gastoCaja?: number;
  gastoEtiqueta?: number;
  gastoFleje?: number;
  gastoTarima?: number;
}

export interface ClienteDB extends BaseDBEntity {
  nombre: string;
  direccion: string;
  lat?: number;
  lng?: number;
  radioGeocercaMetros: number;
}

export interface EstatusDB extends BaseDBEntity {
  nombre: string;
  color: string;
}

export interface ResponsableDB extends BaseDBEntity {
    nombre: string;
    puesto: string;
    horarioAtencion?: string;
    correo?: string;
    numeroWhatsapp?: string;
}

export interface BrockerDB extends BaseDBEntity {
    nombre: string;
}

export interface EscalaDB extends BaseDBEntity {
    nombre: string;
}

export interface TipoUnidad extends BaseDBEntity {
    unidad: string;
    capacidad: string;
    nombre?: string;
}

export interface ProductQuantity {
    productId: string;
    manualProductName?: string;
    quantity: number; 
    projectedQty?: number;
    realQty?: number;
    invoiceNumber?: string;
    invoiceUrl?: string;
    esCanje?: boolean;          // Indica que es un producto sustituto/complemento
    canjeDeProductId?: string;  // ID del producto original que no completó su volumen
    mid?: string;
}

export interface TiveEvent {
    tracker_id: string;
    temperature: number;
    humidity?: number;
    location?: string;
    lat?: number;
    lng?: number;
    speed?: number;
    battery?: number;
    timestamp: string;
    alert_type?: string;
    raw_data?: any;
}

export interface Incident {
  type: string;
  location: string;
  timestamp: string;
  description: string;
}

export interface UsaShipmentReport extends BaseDBEntity {
  tripId: string;
  project: string;
  projectId?: string;
  sucursalId?: string;
  isConsolidated: boolean;
  secondaryProject?: string;
  secondaryProjectId?: string;
  stopOverProjectId?: string;
  loteOriginalId?: string | null;
  loteSecundarioId?: string | null;
  lineaTransportistaId?: string;
  unidadTransporteId?: string;
  arrivedAtStopOver?: string;
  departedFromStopOver?: string;
  clientId: string;
  products: ProductQuantity[];
  logisticStatus: string;
  departureDateTime: string;
  realDepartureDate?: string;
  arrivalDateTime?: string;
  expectedArrival?: string;
  responsibleId?: string;
  unitType?: string;
  driverName?: string;
  boxNumber?: string;
  tractorPlates?: string;
  caat?: string;
  alpha?: string;
  transferAgent?: string;
  transferPhone?: string;
  freightCost?: number | string | null;
  sealNumber?: string;
  temperature?: number | string | null;
  totalRealBoxes?: number | string | null; 
  tiveTrackerId?: string;
  comments?: string;
  incidents: Incident[];
  idealTemp?: number | string | null;
  invoiceNumber?: string;
  invoiceUrl?: string;
  // MI DIOS: Campos para Carrier Scorecard
  carrierRating?: number;
  carrierRatingComments?: string;
  ratingPending?: boolean;
  // JEFE: Campos para Liquidación y Pago de Fletes
  extraCosts?: number;
  fines?: number;
  freightPayer?: string;
  reviewerId?: string;
  passedToPayment?: boolean;
  passedToPaymentDate?: string;
  invoiceReceived?: boolean;
  invoiceReceivedDate?: string;
  carrierInvoiceNumber?: string;
  fiscalFolio?: string;
  freightInPortfolio?: boolean;
  paymentStatus?: string;
}

export interface Productor {
  id: string;
  nombre_productor: string;
  condicion: boolean;
}

export interface Huerta {
  id: string;
  productor_id: string;
  nombre_huerta: string;
  mid?: string;
  arevalo_internal_code?: string;
  ggn?: string;
  condicion: boolean;
}

export interface InspeccionPayload {
  tipo_inspeccion: 'ORIGEN' | 'PT';
  productor_id: string;
  huerta_id: string;
  tamano_muestra: number;
  detalles_danos: Record<string, { peso: number; porcentaje: number }>;
  calidad_score: number;
  estatus: string;
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  DATABASE = 'DATABASE',
  USA_SHIPMENTS = 'USA_SHIPMENTS',
  TIVE_MAP = 'TIVE_MAP',
  QUALITY_INSPECTION = 'QUALITY_INSPECTION', // <-- Nueva vista
  SETTINGS = 'SETTINGS',
  FREIGHT_PAYMENTS = 'FREIGHT_PAYMENTS',
  INVENTORY = 'INVENTORY',
  POLICIES = 'POLICIES',
  INSPECTION_QUALITY = 'INSPECTION_QUALITY',
  INSPECTION_DASHBOARD = 'INSPECTION_DASHBOARD',
  INSPECTION_INCIDENTS = 'INSPECTION_INCIDENTS'
}