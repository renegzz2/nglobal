import { supabase } from "../lib/supabase";

export const sendMessage = async (message: string): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-chat', {
      body: { message },
    });

    if (error) throw error;
    return data.text || "No recibí respuesta del servidor.";
  } catch (error) {
    console.error("Error AI Assistant:", error);
    return "Servicio de IA temporalmente fuera de línea.";
  }
};

export const analyzeImage = async (prompt: string, base64Image: string): Promise<string> => {
    try {
        const { data, error } = await supabase.functions.invoke('gemini-chat', {
            body: { 
                message: prompt,
                image: base64Image 
            },
        });
        if (error) throw error;
        return data.text || "No se pudo analizar la imagen.";
    } catch (error) {
        console.error("Error Quality AI:", error);
        throw error;
    }
};