/**
 * EventFlowValidator - Validador de flujo de eventos para testing
 *
 * Proporciona assertions y validaciones para verificar que el flujo
 * de eventos cumple con los requisitos de la arquitectura propuesta.
 */

import { EventEmitter } from "eventemitter3";
import { DownloadEventType } from "../types";

export interface ValidationResult {
	passed: boolean;
	message: string;
	details?: unknown;
}

export interface ValidationSuite {
	name: string;
	results: ValidationResult[];
	passed: boolean;
	duration: number;
}

export interface ExpectedEventFlow {
	eventType: string;
	expectedSources: string[];
	maxEmissions: number;
	requiredData?: string[];
}

/**
 * Configuración de flujo esperado por fase de migración
 */
export const EXPECTED_FLOWS = {
	// Fase 0: Estado actual (antes de cambios)
	CURRENT: {
		STREAM_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: [
				"NativeManager",
				"QueueManager",
				"StreamDownloadService",
				"DownloadService",
				"DownloadsManager",
			],
			maxEmissions: 9,
			requiredData: ["downloadId", "percent"],
		},
		BINARY_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["BinaryDownloadService", "DownloadService", "DownloadsManager"],
			maxEmissions: 5,
			requiredData: ["taskId", "percent"],
		},
	},

	// Fase 1: Después de eliminar suscripciones redundantes
	PHASE_1: {
		STREAM_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["NativeManager", "QueueManager", "DownloadsManager"],
			maxEmissions: 5,
			requiredData: ["downloadId", "percent"],
		},
		BINARY_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["BinaryDownloadService", "DownloadsManager"],
			maxEmissions: 3,
			requiredData: ["taskId", "percent"],
		},
	},

	// Fase 2: Después de simplificar QueueManager
	PHASE_2: {
		STREAM_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["NativeManager", "DownloadsManager"],
			maxEmissions: 3,
			requiredData: ["downloadId", "percent"],
		},
		BINARY_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["BinaryDownloadService", "DownloadsManager"],
			maxEmissions: 3,
			requiredData: ["taskId", "percent"],
		},
	},

	// Fase 3: Arquitectura final
	FINAL: {
		STREAM_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["NativeManager", "DownloadsManager"],
			maxEmissions: 2,
			requiredData: ["downloadId", "percent"],
		},
		BINARY_PROGRESS: {
			eventType: DownloadEventType.PROGRESS,
			expectedSources: ["BinaryDownloadService", "DownloadsManager"],
			maxEmissions: 2,
			requiredData: ["taskId", "percent"],
		},
	},
};

export class EventFlowValidator {
	private trackedEvents: Array<{
		eventType: string;
		source: string;
		data: unknown;
		timestamp: number;
	}> = [];

	private eventEmitter: EventEmitter = new EventEmitter();

	/**
	 * Registra un evento para validación
	 */
	public recordEvent(eventType: string, source: string, data: unknown): void {
		this.trackedEvents.push({
			eventType,
			source,
			data,
			timestamp: Date.now(),
		});
	}

	/**
	 * Limpia eventos registrados
	 */
	public clear(): void {
		this.trackedEvents = [];
	}

	/**
	 * Valida que el número de emisiones no exceda el máximo
	 */
	public validateMaxEmissions(
		eventType: string,
		downloadId: string,
		maxExpected: number
	): ValidationResult {
		const events = this.trackedEvents.filter(e => {
			if (e.eventType !== eventType) {
				return false;
			}
			const data = e.data as Record<string, unknown>;
			return data.downloadId === downloadId || data.taskId === downloadId;
		});

		const passed = events.length <= maxExpected;

		return {
			passed,
			message: passed
				? `✅ ${eventType}: ${events.length} emisiones (máx: ${maxExpected})`
				: `❌ ${eventType}: ${events.length} emisiones excede máximo de ${maxExpected}`,
			details: {
				actual: events.length,
				expected: maxExpected,
				sources: events.map(e => e.source),
			},
		};
	}

	/**
	 * Valida que los eventos vengan de las fuentes esperadas
	 */
	public validateSources(
		eventType: string,
		downloadId: string,
		expectedSources: string[]
	): ValidationResult {
		const events = this.trackedEvents.filter(e => {
			if (e.eventType !== eventType) {
				return false;
			}
			const data = e.data as Record<string, unknown>;
			return data.downloadId === downloadId || data.taskId === downloadId;
		});

		const actualSources = [...new Set(events.map(e => e.source))];
		const unexpectedSources = actualSources.filter(s => !expectedSources.includes(s));
		const passed = unexpectedSources.length === 0;

		return {
			passed,
			message: passed
				? `✅ ${eventType}: fuentes válidas [${actualSources.join(", ")}]`
				: `❌ ${eventType}: fuentes inesperadas [${unexpectedSources.join(", ")}]`,
			details: {
				actual: actualSources,
				expected: expectedSources,
				unexpected: unexpectedSources,
			},
		};
	}

	/**
	 * Valida que los datos del evento contengan los campos requeridos
	 */
	public validateRequiredData(
		eventType: string,
		downloadId: string,
		requiredFields: string[]
	): ValidationResult {
		const events = this.trackedEvents.filter(e => {
			if (e.eventType !== eventType) {
				return false;
			}
			const data = e.data as Record<string, unknown>;
			return data.downloadId === downloadId || data.taskId === downloadId;
		});

		if (events.length === 0) {
			return {
				passed: false,
				message: `❌ ${eventType}: no se encontraron eventos para ${downloadId}`,
				details: { requiredFields },
			};
		}

		const missingFields: string[] = [];
		for (const event of events) {
			const data = event.data as Record<string, unknown>;
			for (const field of requiredFields) {
				if (!(field in data) && !missingFields.includes(field)) {
					missingFields.push(field);
				}
			}
		}

		const passed = missingFields.length === 0;

		return {
			passed,
			message: passed
				? `✅ ${eventType}: todos los campos requeridos presentes`
				: `❌ ${eventType}: campos faltantes [${missingFields.join(", ")}]`,
			details: {
				required: requiredFields,
				missing: missingFields,
			},
		};
	}

	/**
	 * Valida que no haya ciclos de eventos (A → B → A)
	 */
	public validateNoCycles(eventType: string, downloadId: string): ValidationResult {
		const events = this.trackedEvents.filter(e => {
			if (e.eventType !== eventType) {
				return false;
			}
			const data = e.data as Record<string, unknown>;
			return data.downloadId === downloadId || data.taskId === downloadId;
		});

		const sourceSequence = events.map(e => e.source);
		const cycles: string[] = [];

		// Detectar si una fuente aparece más de una vez (posible ciclo)
		const sourceCounts: Record<string, number> = {};
		for (const source of sourceSequence) {
			sourceCounts[source] = (sourceCounts[source] || 0) + 1;
			if (sourceCounts[source] > 1) {
				cycles.push(source);
			}
		}

		const passed = cycles.length === 0;

		return {
			passed,
			message: passed
				? `✅ ${eventType}: sin ciclos detectados`
				: `❌ ${eventType}: posibles ciclos en [${cycles.join(", ")}]`,
			details: {
				sequence: sourceSequence,
				cycles,
			},
		};
	}

	/**
	 * Valida el orden de emisión de eventos
	 */
	public validateOrder(
		eventType: string,
		downloadId: string,
		expectedOrder: string[]
	): ValidationResult {
		const events = this.trackedEvents.filter(e => {
			if (e.eventType !== eventType) {
				return false;
			}
			const data = e.data as Record<string, unknown>;
			return data.downloadId === downloadId || data.taskId === downloadId;
		});

		const actualOrder = events.map(e => e.source);

		// Verificar que el orden actual siga el orden esperado
		let expectedIndex = 0;
		for (const source of actualOrder) {
			const foundIndex = expectedOrder.indexOf(source, expectedIndex);
			if (foundIndex === -1) {
				return {
					passed: false,
					message: `❌ ${eventType}: orden incorrecto, ${source} no esperado en posición actual`,
					details: {
						actual: actualOrder,
						expected: expectedOrder,
					},
				};
			}
			expectedIndex = foundIndex;
		}

		return {
			passed: true,
			message: `✅ ${eventType}: orden correcto`,
			details: {
				actual: actualOrder,
				expected: expectedOrder,
			},
		};
	}

	/**
	 * Ejecuta una suite completa de validaciones para una fase
	 */
	public runValidationSuite(
		phase: keyof typeof EXPECTED_FLOWS,
		downloadId: string,
		downloadType: "STREAM" | "BINARY"
	): ValidationSuite {
		const startTime = Date.now();
		const results: ValidationResult[] = [];
		const flowKey = `${downloadType}_PROGRESS` as keyof (typeof EXPECTED_FLOWS)[typeof phase];
		const expectedFlow = EXPECTED_FLOWS[phase][flowKey];

		if (!expectedFlow) {
			return {
				name: `${phase} - ${downloadType}`,
				results: [
					{
						passed: false,
						message: `❌ No hay configuración de flujo para ${phase}/${downloadType}`,
					},
				],
				passed: false,
				duration: Date.now() - startTime,
			};
		}

		// Validar máximo de emisiones
		results.push(
			this.validateMaxEmissions(expectedFlow.eventType, downloadId, expectedFlow.maxEmissions)
		);

		// Validar fuentes
		results.push(
			this.validateSources(expectedFlow.eventType, downloadId, expectedFlow.expectedSources)
		);

		// Validar datos requeridos
		if (expectedFlow.requiredData) {
			results.push(
				this.validateRequiredData(
					expectedFlow.eventType,
					downloadId,
					expectedFlow.requiredData
				)
			);
		}

		// Validar que no haya ciclos
		results.push(this.validateNoCycles(expectedFlow.eventType, downloadId));

		const allPassed = results.every(r => r.passed);

		return {
			name: `${phase} - ${downloadType}`,
			results,
			passed: allPassed,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Imprime resultados de validación
	 */
	public printValidationResults(suite: ValidationSuite): void {
		console.log("\n" + "=".repeat(60));
		console.log(`🧪 VALIDATION SUITE: ${suite.name}`);
		console.log("=".repeat(60));

		for (const result of suite.results) {
			console.log(result.message);
			if (!result.passed && result.details) {
				console.log(`   Detalles: ${JSON.stringify(result.details, null, 2)}`);
			}
		}

		console.log("-".repeat(60));
		console.log(
			suite.passed
				? `✅ SUITE PASSED (${suite.duration}ms)`
				: `❌ SUITE FAILED (${suite.duration}ms)`
		);
		console.log("=".repeat(60) + "\n");
	}

	/**
	 * Obtiene estadísticas de eventos
	 */
	public getStats(): {
		totalEvents: number;
		byType: Record<string, number>;
		bySource: Record<string, number>;
	} {
		const byType: Record<string, number> = {};
		const bySource: Record<string, number> = {};

		for (const event of this.trackedEvents) {
			byType[event.eventType] = (byType[event.eventType] || 0) + 1;
			bySource[event.source] = (bySource[event.source] || 0) + 1;
		}

		return {
			totalEvents: this.trackedEvents.length,
			byType,
			bySource,
		};
	}
}

// Singleton export
export const eventFlowValidator = new EventFlowValidator();
