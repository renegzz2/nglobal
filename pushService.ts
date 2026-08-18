import { supabase } from './lib/supabase';

const VAPID_PUBLIC_KEY = 'BN1TAYTDSoyi5zln7KKxZ4Va_QnzNF7H8cajpm0DQoWNrGRyZN38DcK-wGIGucS9nlWunUkkF4sgCFng2KreEZ0';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const subscribeUserToPush = async (userName: string) => {
  console.group('🔍 [DIAGNÓSTICO PUSH]');
  
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.error("❌ El navegador NO soporta Notificaciones Push.");
    console.groupEnd();
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn("❌ Permiso de notificaciones DENEGADO.");
      console.groupEnd();
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // MI DIOS: UPSERT reforzado para machacar cualquier conflicto previo
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { 
          user_name: userName, 
          subscription: subscription.toJSON() 
        }, 
        { 
          onConflict: 'user_name',
          ignoreDuplicates: false 
        }
      );

    if (error) {
      window.alert(`❌ ERROR EN DB: ${error.message}`);
      console.groupEnd();
      return false;
    }

    console.log("✅ REGISTRO EXITOSO: El dispositivo ha sido sincronizado en la base de datos.");
    console.groupEnd();
    return true;
  } catch (err: any) {
    window.alert(`❌ ERROR CRÍTICO: ${err.message}`);
    console.groupEnd();
    return false;
  }
};

// BLOQUE NUEVO: FUNCIÓN DE PRUEBA DE SISTEMA
// UBICACIÓN: Final del archivo
// JUSTIFICACIÓN: Permite al usuario verificar que la Edge Function puede alcanzar su dispositivo.
export const sendTestPush = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { 
        title: 'TEST DE SISTEMA NGLOBAL', 
        body: 'El canal de comunicación Push está ACTIVO y vinculado a su dispositivo.',
        trip_id: 'DIAGNOSTICO'
      }
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error en test push:", err);
    return false;
  }
};