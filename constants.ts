// JEFE: Importamos ShipmentStatus de types para el mock
import { ShipmentStatus } from './types';

export const CHART_DATA = [
  { name: 'Lun', value: 45 },
  { name: 'Mar', value: 52 },
  { name: 'Mie', value: 38 },
  { name: 'Jue', value: 65 },
  { name: 'Vie', value: 48 },
  { name: 'Sab', value: 25 },
  { name: 'Dom', value: 15 },
];

// JEFE: Definimos MOCK_SHIPMENTS para corregir error en ShipmentList.tsx
export const MOCK_SHIPMENTS = [
  {
    id: '1',
    trackingNumber: 'NG-849201',
    client: 'Walmart USA',
    origin: 'Culiacán, SIN',
    destination: 'McAllen, TX',
    weight: '18,500 kg',
    status: ShipmentStatus.IN_TRANSIT,
    eta: 'Hoy 14:00'
  },
  {
    id: '2',
    trackingNumber: 'NG-992831',
    client: 'H-E-B Houston',
    origin: 'Hermosillo, SON',
    destination: 'Laredo, TX',
    weight: '20,100 kg',
    status: ShipmentStatus.DELAYED,
    eta: 'Mañana 09:00'
  },
  {
    id: '3',
    trackingNumber: 'NG-110293',
    client: 'Kroger Dallas',
    origin: 'Uruapan, MICH',
    destination: 'Pharr, TX',
    weight: '19,200 kg',
    status: ShipmentStatus.DELIVERED,
    eta: 'Finalizado'
  },
  {
    id: '4',
    trackingNumber: 'NG-445522',
    client: 'Costco Wholesale',
    origin: 'Zamora, MICH',
    destination: 'Nogales, AZ',
    weight: '15,000 kg',
    status: ShipmentStatus.PENDING,
    eta: 'En espera'
  },
  {
    id: '5',
    trackingNumber: 'NG-778811',
    client: 'Trader Joe\'s',
    origin: 'Ensenada, BC',
    destination: 'Otay Mesa, CA',
    weight: '22,000 kg',
    status: ShipmentStatus.IN_TRANSIT,
    eta: 'Hoy 18:30'
  }
];