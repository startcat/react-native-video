/**
 * Instrumentación de componentes para tracking de eventos
 *
 * Este módulo proporciona funciones para instrumentar los componentes
 * del sistema de descargas y rastrear el flujo de eventos.
 *
 * USO:
 * 1. Importar en el archivo principal de la app (antes de inicializar descargas)
 * 2. Llamar a instrumentAll() para activar tracking
 * 3. Usar eventFlowTracker para ver eventos
 * 4. Llamar a removeInstrumentation() para desactivar
 */

import { eventFlowTracker } from "./EventFlowTracker";
import { eventFlowValidator } from "./EventFlowValidator";

// Tipos para los componentes que vamos a instrumentar
type EventEmitterLike = {
	emit: (event: string, ...args: unknown[]) => boolean;
	on: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

type SubscribableLike = {
	subscribe: (event: string, callback: (data: unknown) => void) => () => void;
};

// Almacenar referencias originales
const originalMethods: Map<string, Map<string, unknown>> = new Map();

/**
 * Instrumenta el método emit de un EventEmitter
 */
export function instrumentEmitter(componentName: string, emitter: EventEmitterLike): () => void {
	const originalEmit = emitter.emit.bind(emitter);

	if (!originalMethods.has(componentName)) {
		originalMethods.set(componentName, new Map());
	}
	originalMethods.get(componentName)!.set("emit", originalEmit);

	emitter.emit = function (event: string, ...args: unknown[]): boolean {
		// Registrar evento
		const data = args[0];
		eventFlowTracker.trackEvent(event, componentName, data);
		eventFlowValidator.recordEvent(event, componentName, data);

		// Llamar al método original
		return originalEmit(event, ...args);
	};

	return () => {
		emitter.emit = originalEmit;
		originalMethods.get(componentName)?.delete("emit");
	};
}

/**
 * Instrumenta el método subscribe de un componente
 */
export function instrumentSubscriber(
	componentName: string,
	subscriber: SubscribableLike
): () => void {
	const originalSubscribe = subscriber.subscribe.bind(subscriber);

	if (!originalMethods.has(componentName)) {
		originalMethods.set(componentName, new Map());
	}
	originalMethods.get(componentName)!.set("subscribe", originalSubscribe);

	subscriber.subscribe = function (event: string, callback: (data: unknown) => void): () => void {
		console.log(`🔗 [Instrumentation] ${componentName} subscribed to "${event}"`);

		// Wrapper del callback para registrar cuando se recibe
		const wrappedCallback = (data: unknown) => {
			console.log(`📨 [Instrumentation] ${componentName} received "${event}"`);
			callback(data);
		};

		return originalSubscribe(event, wrappedCallback);
	};

	return () => {
		subscriber.subscribe = originalSubscribe;
		originalMethods.get(componentName)?.delete("subscribe");
	};
}

/**
 * Crea un proxy para interceptar todas las llamadas a emit
 */
export function createTrackedEmitter(
	componentName: string,
	originalEmitter: EventEmitterLike
): EventEmitterLike {
	return new Proxy(originalEmitter, {
		get(target, prop) {
			if (prop === "emit") {
				return function (event: string, ...args: unknown[]): boolean {
					const data = args[0];
					eventFlowTracker.trackEvent(event, componentName, data);
					eventFlowValidator.recordEvent(event, componentName, data);
					return target.emit(event, ...args);
				};
			}
			const value = target[prop as keyof typeof target];
			if (typeof value === "function") {
				return value.bind(target);
			}
			return value;
		},
	});
}

/**
 * Instrumenta todos los componentes del sistema de descargas
 *
 * IMPORTANTE: Llamar ANTES de inicializar el sistema de descargas
 */
export async function instrumentAll(): Promise<() => void> {
	const cleanupFunctions: Array<() => void> = [];

	console.log("🔧 [Instrumentation] Starting instrumentation of download components...");

	try {
		// Importar componentes dinámicamente para evitar problemas de orden
		const { nativeManager } = await import("../managers/NativeManager");
		const { queueManager } = await import("../managers/QueueManager");
		const { downloadsManager } = await import("../managers/DownloadsManager");
		const { downloadService } = await import("../services/download/DownloadService");

		// Instrumentar NativeManager
		if (nativeManager && "eventEmitter" in nativeManager) {
			// @ts-expect-error - Accediendo a propiedad privada para instrumentación
			const emitter = nativeManager.eventEmitter as EventEmitterLike;
			cleanupFunctions.push(instrumentEmitter("NativeManager", emitter));
			console.log("✅ [Instrumentation] NativeManager instrumented");
		}

		// Instrumentar QueueManager
		if (queueManager && "eventEmitter" in queueManager) {
			// @ts-expect-error - Accediendo a propiedad privada para instrumentación
			const emitter = queueManager.eventEmitter as EventEmitterLike;
			cleanupFunctions.push(instrumentEmitter("QueueManager", emitter));
			console.log("✅ [Instrumentation] QueueManager instrumented");
		}

		// Instrumentar DownloadsManager
		if (downloadsManager && "eventEmitter" in downloadsManager) {
			// @ts-expect-error - Accediendo a propiedad privada para instrumentación
			const emitter = downloadsManager.eventEmitter as EventEmitterLike;
			cleanupFunctions.push(instrumentEmitter("DownloadsManager", emitter));
			console.log("✅ [Instrumentation] DownloadsManager instrumented");
		}

		// Instrumentar DownloadService
		if (downloadService && "eventEmitter" in downloadService) {
			// @ts-expect-error - Accediendo a propiedad privada para instrumentación
			const emitter = downloadService.eventEmitter as EventEmitterLike;
			cleanupFunctions.push(instrumentEmitter("DownloadService", emitter));
			console.log("✅ [Instrumentation] DownloadService instrumented");
		}

		// Intentar instrumentar StreamDownloadService
		try {
			const { streamDownloadService } = await import(
				"../services/download/StreamDownloadService"
			);
			if (streamDownloadService && "eventEmitter" in streamDownloadService) {
				// @ts-expect-error - Accediendo a propiedad privada para instrumentación
				const emitter = streamDownloadService.eventEmitter as EventEmitterLike;
				cleanupFunctions.push(instrumentEmitter("StreamDownloadService", emitter));
				console.log("✅ [Instrumentation] StreamDownloadService instrumented");
			}
		} catch {
			console.log("⚠️ [Instrumentation] StreamDownloadService not available");
		}

		// Intentar instrumentar BinaryDownloadService
		try {
			const { binaryDownloadService } = await import(
				"../services/download/BinaryDownloadService"
			);
			if (binaryDownloadService && "eventEmitter" in binaryDownloadService) {
				// @ts-expect-error - Accediendo a propiedad privada para instrumentación
				const emitter = binaryDownloadService.eventEmitter as EventEmitterLike;
				cleanupFunctions.push(instrumentEmitter("BinaryDownloadService", emitter));
				console.log("✅ [Instrumentation] BinaryDownloadService instrumented");
			}
		} catch {
			console.log("⚠️ [Instrumentation] BinaryDownloadService not available");
		}

		console.log(
			`🔧 [Instrumentation] Complete. ${cleanupFunctions.length} components instrumented.`
		);
	} catch (error) {
		console.error("❌ [Instrumentation] Error during instrumentation:", error);
	}

	// Retornar función de limpieza
	return () => {
		console.log("🔧 [Instrumentation] Removing instrumentation...");
		for (const cleanup of cleanupFunctions) {
			cleanup();
		}
		console.log("🔧 [Instrumentation] Instrumentation removed.");
	};
}

/**
 * Helper para ejecutar una prueba de flujo de eventos
 */
export async function runEventFlowTest(
	testName: string,
	testFn: () => Promise<void>,
	expectedPhase: "CURRENT" | "PHASE_1" | "PHASE_2" | "FINAL" = "CURRENT"
): Promise<void> {
	console.log("\n" + "=".repeat(60));
	console.log(`🧪 TEST: ${testName}`);
	console.log("=".repeat(60));

	// Limpiar estado previo
	eventFlowTracker.clear();
	eventFlowValidator.clear();

	// Iniciar tracking
	eventFlowTracker.startTracking();

	try {
		// Ejecutar test
		await testFn();

		// Esperar un poco para que lleguen todos los eventos
		await new Promise(resolve => setTimeout(resolve, 2000));
	} catch (error) {
		console.error(`❌ Test error: ${error}`);
	}

	// Detener tracking y generar reporte
	eventFlowTracker.stopTracking();
	eventFlowTracker.printReport();

	// Validar resultados
	// Nota: Necesitaríamos el downloadId del test para validar correctamente
	console.log(`\n📋 Expected phase: ${expectedPhase}`);
	console.log("=".repeat(60) + "\n");
}

// Exportar instancias para uso directo
export { eventFlowTracker, eventFlowValidator };
