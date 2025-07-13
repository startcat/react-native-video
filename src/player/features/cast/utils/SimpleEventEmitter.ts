import { EventListener } from '../types/events';

export class SimpleEventEmitter {
    private events: { [key: string]: EventListener[] } = {};
    private maxListeners: number = 10;

    /*
     *  Agregar un listener a un evento
     *
     */
    
    on(event: string, listener: EventListener): this {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        
        this.events[event].push(listener);
        
        // Advertir si hay demasiados listeners
        if (this.events[event].length > this.maxListeners) {
            console.warn(`Possible memory leak detected. ${this.events[event].length} listeners added to event "${event}". Use setMaxListeners() to increase limit.`);
        }
        
        return this;
    }

    /*
     *  Agregar un listener que se ejecuta solo una vez
     *
     */

    once(event: string, listener: EventListener): this {
        const onceWrapper = (...args: any[]) => {
            listener(...args);
            this.off(event, onceWrapper);
        };
        
        this.on(event, onceWrapper);
        return this;
    }

    /*
     *  Remover un listener específico
     *
     */
    
    off(event: string, listener: EventListener): this {
        if (!this.events[event]) {
            return this;
        }
        
        const index = this.events[event].indexOf(listener);
        if (index > -1) {
            this.events[event].splice(index, 1);
        }
        
        // Limpiar array si está vacío
        if (this.events[event].length === 0) {
            delete this.events[event];
        }
        
        return this;
    }

    /*
     *  Remover todos los listeners de un evento
     *
     */

    removeAllListeners(event?: string): this {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
        
        return this;
    }

    /*
     *  Emitir un evento
     *
     */

    emit(event: string, ...args: any[]): boolean {
        if (!this.events[event]) {
            return false;
        }
        
        // Crear copia del array para evitar problemas si se modifican los listeners durante la emisión
        const listeners = [...this.events[event]];
        
        listeners.forEach(listener => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`Error in event listener for "${event}":`, error);
            }
        });
        
        return true;
    }

    /*
     *  Obtener listeners de un evento
     *
     */

    listeners(event: string): EventListener[] {
        return this.events[event] ? [...this.events[event]] : [];
    }

    /*
     *  Obtener número de listeners de un evento
     *
     */

    listenerCount(event: string): number {
        return this.events[event] ? this.events[event].length : 0;
    }

    /*
     *  Obtener todos los nombres de eventos
     *
     */

    eventNames(): string[] {
        return Object.keys(this.events);
    }

    /*
     *  Establecer máximo número de listeners
     *
     */

    setMaxListeners(n: number): this {
        this.maxListeners = n;
        return this;
    }

    /*
     *  Obtener máximo número de listeners
     *
     */

    getMaxListeners(): number {
        return this.maxListeners;
    }

    /*
     *  Agregar listener al principio
     *
     */

    prependListener(event: string, listener: EventListener): this {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        
        this.events[event].unshift(listener);
        return this;
    }

    /*
     *  Agregar listener que se ejecuta una vez al principio
     *
     */

    prependOnceListener(event: string, listener: EventListener): this {
        const onceWrapper = (...args: any[]) => {
            listener(...args);
            this.off(event, onceWrapper);
        };
        
        this.prependListener(event, onceWrapper);
        return this;
    }
}

// Alias para compatibilidad
export { SimpleEventEmitter as EventEmitter };
