import { UserRole, View } from '../../types';

export function canAccessView(role: UserRole, view: View): boolean {
  // Las 3 vistas de Inspección SOLO pueden ser vistas por ADMINISTRADOR e INSPECTOR
  if ([View.INSPECTION_QUALITY, View.INSPECTION_DASHBOARD, View.INSPECTION_INCIDENTS].includes(view)) {
    return [UserRole.ADMINISTRADOR, UserRole.INSPECTOR].includes(role);
  }

  // El rol INSPECTOR NO puede ver ninguna otra vista del sistema
  if (role === UserRole.INSPECTOR) {
    return false;
  }

  // Permisos existentes para los demás roles
  if ([UserRole.GERENCIA, UserRole.ADMINISTRADOR].includes(role)) return true;
  if ([UserRole.DIRECCION, UserRole.SUBDIRECCION].includes(role)) {
    return [View.DASHBOARD, View.STRATEGIC_PLANNING, View.EXEC_REPORT, View.TIVE_MAP, View.USA_SHIPMENTS, View.SETTINGS, View.FREIGHT_PAYMENTS].includes(view);
  }
  if (role === UserRole.LIDER_PROYECTO) {
    return [View.STRATEGIC_PLANNING, View.LIDER_PROGRAMACION_USA, View.SETTINGS].includes(view);
  }
  if (role === UserRole.COORDINADOR) {
    return [View.USA_SHIPMENTS, View.DATABASE, View.TIVE_MAP, View.INVENTORY, View.SETTINGS].includes(view);
  }
  if ([UserRole.SUBGERENCIA, UserRole.ADMINISTRATIVO].includes(role)) {
    return [View.USA_SHIPMENTS, View.DATABASE, View.TIVE_MAP, View.SETTINGS, View.FREIGHT_PAYMENTS, View.INVENTORY].includes(view);
  }
  return false;
}
