
export interface WhatsAppTemplateParams {
    name: string;
    language: { code: string };
    components: any[];
}

// Access environment variables through process.env or import.meta.env for Vite
const PHONE_ID = (typeof process !== 'undefined' && process.env.WHATSAPP_PHONE_ID) || "";
const ACCESS_TOKEN = (typeof process !== 'undefined' && process.env.WHATSAPP_ACCESS_TOKEN) || "";

export const sendWhatsAppMessage = async (to: string, template: string, components: any[] = []) => {
    try {
        const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: to.replace(/\D/g, ''), // Clean non-digits
                type: "template",
                template: {
                    name: template,
                    language: { code: "es_MX" },
                    components
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error?.message || 'Error desconocido de Meta API');
        }
        return data;
    } catch (error) {
        console.error("WhatsApp Send Error:", error);
        throw error;
    }
};

export const sendWhatsAppText = async (to: string, body: string) => {
    try {
        const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to.replace(/\D/g, ''),
                type: "text",
                text: { body }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error?.message || 'Error desconocido de Meta API (Text)');
        }
        return data;
    } catch (error) {
        console.error("WhatsApp Text Error:", error);
        throw error;
    }
};
