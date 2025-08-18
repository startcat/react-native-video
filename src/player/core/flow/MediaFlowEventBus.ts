import type { MediaFlowEvents } from './types';

type EventHandler<T = any> = (data: T) => void;
type UnsubscribeFn = () => void;

interface EventHistoryEntry {
    event: string;
    data: any;
    timestamp: number;
    source?: string;
}

export class MediaFlowEventBus {
    
    private events: Map<keyof MediaFlowEvents, Set<EventHandler>> = new Map();
    private eventHistory: EventHistoryEntry[] = [];
    private maxHistorySize = 50;
    private isDebugMode = false;
    private isPaused = false;
    private queuedEvents: Array<{ event: keyof MediaFlowEvents; data: any }> = [];

    constructor(debugMode = false) {
        this.isDebugMode = debugMode;
    }

    /*
     *  Suscribirse a un evento específico
     *
     */

    on<K extends keyof MediaFlowEvents>(
        event: K, 
        handler: EventHandler<MediaFlowEvents[K]>
    ): UnsubscribeFn {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
    
        const handlers = this.events.get(event)!;
        handlers.add(handler);
    
        this.debug(`Subscribed to ${event}. Total handlers: ${handlers.size}`);
    
        // Retorna función para desuscribirse
        return () => this.off(event, handler);
    }

    /*
     *  Suscribirse a un evento una sola vez
     *
     */

    once<K extends keyof MediaFlowEvents>(
        event: K,
        handler: EventHandler<MediaFlowEvents[K]>
    ): UnsubscribeFn {
        const wrappedHandler = (data: MediaFlowEvents[K]) => {
            handler(data);
            this.off(event, wrappedHandler as EventHandler);
        };
    
        return this.on(event, wrappedHandler as EventHandler);
    }

    /*
     *  Emitir un evento
     *
     */
    
    emit<K extends keyof MediaFlowEvents>(
        event: K, 
        data: MediaFlowEvents[K],
        source?: string
    ): void {
    
        // Si está pausado, encolar el evento
        if (this.isPaused) {
            this.queuedEvents.push({ event, data });
            return;
        }

        // Guardar en historial
        this.addToHistory(event as string, data, source);
    
        // Log en modo debug
        this.debug(`Emitting ${event}:`, data);
    
        // Emitir a todos los handlers
        const handlers = this.events.get(event);
        if (handlers && handlers.size > 0) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[MediaFlowEventBus] Error in handler for ${event}:`, error);
                    // No detener la propagación a otros handlers
                }
            });
        }
    }

    /*
     *  Desuscribirse de un evento
     *
     */
    
    off<K extends keyof MediaFlowEvents>(
        event: K, 
        handler: EventHandler
    ): void {
    
        const handlers = this.events.get(event);
    
        if (handlers) {
            const removed = handlers.delete(handler);
            if (removed) {
                this.debug(`Unsubscribed from ${event}. Remaining handlers: ${handlers.size}`);
            }
      
            // Limpiar el Set si está vacío
            if (handlers.size === 0) {
                this.events.delete(event);
            }
        }
    }

    /*
     *  Desuscribirse de todos los eventos
     *
     */

    offAll(event?: keyof MediaFlowEvents): void {
        if (event) {
            this.events.delete(event);
            this.debug(`Removed all handlers for ${event}`);
        } else {
            const eventCount = this.events.size;
            this.events.clear();
            this.debug(`Cleared all handlers for ${eventCount} events`);
        }
    }

    /*
     *  Pausar la emisión de eventos (útil durante transiciones)
     *
     */
    
    pause(): void {
        this.isPaused = true;
        this.debug('Event emission paused');
    }

    /*
     *  Reanudar la emisión y procesar eventos encolados
     *
     */
    
    resume(): void {
        this.isPaused = false;
        this.debug(`Resuming event emission. Queued events: ${this.queuedEvents.length}`);
    
        // Procesar eventos encolados
        const queued = [...this.queuedEvents];
        this.queuedEvents = [];
    
        queued.forEach(({ event, data }) => {
            this.emit(event, data, 'queued');
        });
    }

    /*
     *  Obtener el historial de eventos
     *
     */
    
    getEventHistory(): EventHistoryEntry[] {
        return [...this.eventHistory];
    }

    /*
     *  Obtener eventos filtrados por tipo
     *
     */
    
    getEventsByType(eventType: keyof MediaFlowEvents): EventHistoryEntry[] {
        return this.eventHistory.filter(entry => entry.event === eventType);
    }

    /*
     *  Obtener los últimos N eventos
     *
     */
    
    getRecentEvents(count: number): EventHistoryEntry[] {
        return this.eventHistory.slice(-count);
    }

    /*
     *  Limpiar el historial de eventos
     *
     */
    
    clearHistory(): void {
        this.eventHistory = [];
        this.debug('Event history cleared');
    }

    /*
     *  Obtener estadísticas de eventos
     *
     */
    
    getStats(): {
        totalEvents: number;
        eventCounts: Record<string, number>;
        handlerCounts: Record<string, number>;
        queuedEvents: number;
    } {
        const eventCounts: Record<string, number> = {};
        this.eventHistory.forEach(entry => {
            eventCounts[entry.event] = (eventCounts[entry.event] || 0) + 1;
        });

        const handlerCounts: Record<string, number> = {};
        this.events.forEach((handlers, event) => {
            handlerCounts[event as string] = handlers.size;
        });

        return {
            totalEvents: this.eventHistory.length,
            eventCounts,
            handlerCounts,
            queuedEvents: this.queuedEvents.length
        };
    }

    /*
     *  Habilitar/deshabilitar modo debug
     *
     */
    
    setDebugMode(enabled: boolean): void {
        this.isDebugMode = enabled;
    }

    /*
     *  Métodos privados
     *
     */

    dispose(): void {
        this.events.clear();
        this.eventHistory = [];
        this.queuedEvents = [];
        this.debug('EventBus disposed');
    }

    /*
     *  Métodos privados
     *
     */
    
    private addToHistory(event: string, data: any, source?: string): void {
        this.eventHistory.push({
            event,
            data: this.isDebugMode ? data : { ...data }, // Clonar en debug para evitar mutaciones
            timestamp: Date.now(),
            source
        });
    
        // Mantener el tamaño del historial
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    private debug(message: string, ...args: any[]): void {
        if (this.isDebugMode) {
            console.log(`[MediaFlowEventBus] ${message}`, ...args);
        }
    }
}