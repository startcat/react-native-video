/**
 * EventFlowTracker - Herramienta de debugging para rastrear el flujo de eventos
 *
 * Esta clase intercepta y registra todos los eventos emitidos por los componentes
 * del sistema de descargas, permitiendo:
 * - Detectar eventos duplicados
 * - Medir latencia entre emisiones
 * - Identificar el origen de cada evento
 * - Generar reportes de flujo
 */

import { EventEmitter } from "eventemitter3";

export interface TrackedEvent {
	id: string;
	eventType: string;
	source: string;
	timestamp: number;
	data: unknown;
	stackTrace?: string;
}

export interface EventFlowReport {
	totalEvents: number;
	uniqueEvents: number;
	duplicateEvents: number;
	eventsByType: Record<string, number>;
	eventsBySource: Record<string, number>;
	duplicateDetails: Array<{
		eventType: string;
		downloadId: string;
		count: number;
		sources: string[];
		timestamps: number[];
	}>;
	averageLatency: number;
	maxLatency: number;
}

export class EventFlowTracker {
	private static instance: EventFlowTracker;
	private events: TrackedEvent[] = [];
	private isTracking: boolean = false;
	private eventEmitter: EventEmitter = new EventEmitter();
	private eventCounter: number = 0;

	// Mapeo de eventos por downloadId para detectar duplicados
	private eventsByDownloadId: Map<string, TrackedEvent[]> = new Map();

	private constructor() {}

	public static getInstance(): EventFlowTracker {
		if (!EventFlowTracker.instance) {
			EventFlowTracker.instance = new EventFlowTracker();
		}
		return EventFlowTracker.instance;
	}

	/**
	 * Inicia el tracking de eventos
	 */
	public startTracking(): void {
		this.isTracking = true;
		this.events = [];
		this.eventsByDownloadId.clear();
		this.eventCounter = 0;
		console.log("🔍 [EventFlowTracker] Tracking started");
	}

	/**
	 * Detiene el tracking y genera reporte
	 */
	public stopTracking(): EventFlowReport {
		this.isTracking = false;
		const report = this.generateReport();
		console.log("🔍 [EventFlowTracker] Tracking stopped");
		return report;
	}

	/**
	 * Registra un evento
	 */
	public trackEvent(
		eventType: string,
		source: string,
		data: unknown,
		captureStack: boolean = false
	): void {
		if (!this.isTracking) return;

		const event: TrackedEvent = {
			id: `evt_${++this.eventCounter}`,
			eventType,
			source,
			timestamp: Date.now(),
			data,
			stackTrace: captureStack ? new Error().stack : undefined,
		};

		this.events.push(event);

		// Agrupar por downloadId para detectar duplicados
		const downloadId = this.extractDownloadId(data);
		if (downloadId) {
			const key = `${eventType}:${downloadId}`;
			if (!this.eventsByDownloadId.has(key)) {
				this.eventsByDownloadId.set(key, []);
			}
			this.eventsByDownloadId.get(key)!.push(event);
		}

		// Log en tiempo real
		this.logEvent(event);

		// Emitir para suscriptores externos
		this.eventEmitter.emit("event_tracked", event);
	}

	/**
	 * Extrae el downloadId del payload del evento
	 */
	private extractDownloadId(data: unknown): string | null {
		if (!data || typeof data !== "object") return null;
		const obj = data as Record<string, unknown>;
		return (obj.downloadId || obj.taskId || obj.id) as string | null;
	}

	/**
	 * Log formateado de evento
	 */
	private logEvent(event: TrackedEvent): void {
		const downloadId = this.extractDownloadId(event.data);
		const duplicateCount = downloadId
			? this.eventsByDownloadId.get(`${event.eventType}:${downloadId}`)?.length || 1
			: 1;

		const duplicateWarning = duplicateCount > 1 ? ` ⚠️ DUPLICATE #${duplicateCount}` : "";

		console.log(
			`🔍 [${event.id}] ${event.eventType} from ${event.source}` +
				(downloadId ? ` (${downloadId})` : "") +
				duplicateWarning
		);
	}

	/**
	 * Genera reporte de flujo de eventos
	 */
	public generateReport(): EventFlowReport {
		const eventsByType: Record<string, number> = {};
		const eventsBySource: Record<string, number> = {};
		const duplicateDetails: EventFlowReport["duplicateDetails"] = [];

		// Contar eventos por tipo y fuente
		for (const event of this.events) {
			eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
			eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
		}

		// Detectar duplicados
		let duplicateEvents = 0;
		for (const [key, events] of this.eventsByDownloadId.entries()) {
			if (events.length > 1) {
				const [eventType, downloadId] = key.split(":");
				duplicateEvents += events.length - 1; // -1 porque el primero no es duplicado

				duplicateDetails.push({
					eventType,
					downloadId,
					count: events.length,
					sources: events.map(e => e.source),
					timestamps: events.map(e => e.timestamp),
				});
			}
		}

		// Calcular latencia entre eventos del mismo tipo/downloadId
		let totalLatency = 0;
		let maxLatency = 0;
		let latencyCount = 0;

		for (const events of this.eventsByDownloadId.values()) {
			if (events.length > 1) {
				for (let i = 1; i < events.length; i++) {
					const latency = events[i].timestamp - events[i - 1].timestamp;
					totalLatency += latency;
					maxLatency = Math.max(maxLatency, latency);
					latencyCount++;
				}
			}
		}

		return {
			totalEvents: this.events.length,
			uniqueEvents: this.eventsByDownloadId.size,
			duplicateEvents,
			eventsByType,
			eventsBySource,
			duplicateDetails,
			averageLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
			maxLatency,
		};
	}

	/**
	 * Imprime reporte formateado en consola
	 */
	public printReport(): void {
		const report = this.generateReport();

		console.log("\n" + "=".repeat(60));
		console.log("📊 EVENT FLOW REPORT");
		console.log("=".repeat(60));

		console.log(`\n📈 RESUMEN:`);
		console.log(`   Total eventos: ${report.totalEvents}`);
		console.log(`   Eventos únicos: ${report.uniqueEvents}`);
		console.log(`   Eventos duplicados: ${report.duplicateEvents}`);
		console.log(
			`   Ratio duplicación: ${((report.duplicateEvents / report.totalEvents) * 100).toFixed(1)}%`
		);

		console.log(`\n📊 EVENTOS POR TIPO:`);
		for (const [type, count] of Object.entries(report.eventsByType)) {
			console.log(`   ${type}: ${count}`);
		}

		console.log(`\n🏷️ EVENTOS POR FUENTE:`);
		for (const [source, count] of Object.entries(report.eventsBySource)) {
			console.log(`   ${source}: ${count}`);
		}

		if (report.duplicateDetails.length > 0) {
			console.log(`\n⚠️ DUPLICADOS DETECTADOS:`);
			for (const dup of report.duplicateDetails) {
				console.log(`   ${dup.eventType} (${dup.downloadId}): ${dup.count} veces`);
				console.log(`      Fuentes: ${dup.sources.join(" → ")}`);
				const latencies = dup.timestamps
					.slice(1)
					.map((t, i) => t - dup.timestamps[i])
					.join("ms, ");
				if (latencies) {
					console.log(`      Latencias: ${latencies}ms`);
				}
			}
		}

		console.log(`\n⏱️ LATENCIA:`);
		console.log(`   Promedio: ${report.averageLatency.toFixed(2)}ms`);
		console.log(`   Máxima: ${report.maxLatency}ms`);

		console.log("\n" + "=".repeat(60) + "\n");
	}

	/**
	 * Obtiene todos los eventos registrados
	 */
	public getEvents(): TrackedEvent[] {
		return [...this.events];
	}

	/**
	 * Limpia todos los eventos registrados
	 */
	public clear(): void {
		this.events = [];
		this.eventsByDownloadId.clear();
		this.eventCounter = 0;
	}

	/**
	 * Suscribirse a eventos de tracking
	 */
	public subscribe(callback: (event: TrackedEvent) => void): () => void {
		this.eventEmitter.on("event_tracked", callback);
		return () => this.eventEmitter.off("event_tracked", callback);
	}

	/**
	 * Verifica si hay duplicados para un evento específico
	 */
	public hasDuplicates(eventType: string, downloadId: string): boolean {
		const key = `${eventType}:${downloadId}`;
		const events = this.eventsByDownloadId.get(key);
		return events ? events.length > 1 : false;
	}

	/**
	 * Obtiene el número de veces que se emitió un evento
	 */
	public getEventCount(eventType: string, downloadId?: string): number {
		if (downloadId) {
			const key = `${eventType}:${downloadId}`;
			return this.eventsByDownloadId.get(key)?.length || 0;
		}
		return this.events.filter(e => e.eventType === eventType).length;
	}
}

// Singleton export
export const eventFlowTracker = EventFlowTracker.getInstance();
