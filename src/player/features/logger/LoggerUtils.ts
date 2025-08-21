/*
 *  Utilidades para logging
 *
 */

export class LoggerUtils {

    /*
     * Formatea un objeto para logging
     *
     */

    static formatObject(obj: any): string {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    }

    /*
     * Trunca mensajes muy largos
     *
     */

    static truncateMessage(message: string, maxLength: number = 500): string {
        if (message.length <= maxLength) {
            return message;
        }
        return `${message.substring(0, maxLength)}... [truncated]`;
    }

    /*
     * Crea un identificador único para sesiones de log
     *
     */

    static createSessionId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

}
