
export const toCamelCase = <T>(obj: any): T => {
    if (Array.isArray(obj)) return obj.map(v => toCamelCase(v)) as any;
    if (obj != null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => ({
            ...result,
            [key.replace(/_([a-z0-9])/g, g => g[1].toUpperCase())]: toCamelCase(obj[key]),
        }), {}) as T;
    }
    return obj;
};

export const toSnakeCase = <T>(obj: any): T => {
    if (obj === '') return null as any;
    
    if (Array.isArray(obj)) return obj.map(v => toSnakeCase(v)) as any;
    if (obj != null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            const value = obj[key];
            // MI DIOS: Limpieza recursiva de valores vacíos
            const cleanValue = value === '' ? null : toSnakeCase(value);
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return {
                ...result,
                [snakeKey]: cleanValue,
            };
        }, {}) as T;
    }
    return obj;
};

export const formatCarrierName = (name?: string | null): string => {
    const clean = String(name || '').trim();
    return clean ? clean.toUpperCase() : 'S/D';
};

export const getTipoUnidadName = (item: any): string => {
    return String(item?.unidad || item?.nombre || item?.name || '').trim();
};

export const getTipoUnidadCapacity = (item: any): number => {
    const raw = String(item?.capacidad || item?.capacity || '').trim();
    const match = raw.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
};
