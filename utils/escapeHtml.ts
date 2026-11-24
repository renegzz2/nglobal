export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, character => {
        const entity: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return entity[character];
    });
}
