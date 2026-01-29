/*
 * SpeedCalculator - Calcula velocidad de descarga usando ventana deslizante
 * Proporciona cálculos más precisos que el promedio desde el inicio
 *
 */

interface SpeedSample {
	timestamp: number;
	bytesWritten: number;
}

/**
 * Calcula velocidad de descarga usando ventana deslizante
 */
export class SpeedCalculator {
	private samples: Map<string, SpeedSample[]> = new Map();
	private readonly windowSize: number; // en milisegundos
	private readonly maxSamples: number;

	constructor(windowSizeMs: number = 10000, maxSamples: number = 20) {
		this.windowSize = windowSizeMs;
		this.maxSamples = maxSamples;
	}

	/**
	 * Añade una muestra de progreso
	 */
	addSample(downloadId: string, bytesWritten: number): void {
		const now = Date.now();
		const samples = this.samples.get(downloadId) || [];

		samples.push({ timestamp: now, bytesWritten });

		// Limpiar muestras fuera de la ventana
		const cutoff = now - this.windowSize;
		const filtered = samples.filter(s => s.timestamp >= cutoff);

		// Limitar número de muestras
		if (filtered.length > this.maxSamples) {
			filtered.splice(0, filtered.length - this.maxSamples);
		}

		this.samples.set(downloadId, filtered);
	}

	/**
	 * Calcula la velocidad actual en bytes/segundo
	 */
	getSpeed(downloadId: string): number {
		const samples = this.samples.get(downloadId);
		if (!samples || samples.length < 2) {
			return 0;
		}

		const oldest = samples[0];
		const newest = samples[samples.length - 1];

		if (!oldest || !newest) {
			return 0;
		}

		const timeDiff = (newest.timestamp - oldest.timestamp) / 1000; // segundos
		const bytesDiff = newest.bytesWritten - oldest.bytesWritten;

		if (timeDiff <= 0) {
			return 0;
		}

		return Math.round(bytesDiff / timeDiff);
	}

	/**
	 * Estima tiempo restante en segundos
	 */
	getEstimatedTimeRemaining(
		downloadId: string,
		totalBytes: number,
		currentBytes: number
	): number {
		const speed = this.getSpeed(downloadId);
		if (speed <= 0) {
			return -1; // Desconocido
		}

		const remainingBytes = totalBytes - currentBytes;
		if (remainingBytes <= 0) {
			return 0;
		}

		return Math.ceil(remainingBytes / speed);
	}

	/**
	 * Limpia datos de una descarga
	 */
	clear(downloadId: string): void {
		this.samples.delete(downloadId);
	}

	/**
	 * Limpia todas las muestras
	 */
	clearAll(): void {
		this.samples.clear();
	}

	/**
	 * Obtiene el número de muestras para una descarga
	 */
	getSampleCount(downloadId: string): number {
		return this.samples.get(downloadId)?.length || 0;
	}
}

// Instancia singleton para uso global
export const speedCalculator = new SpeedCalculator(10000, 20); // 10s ventana, 20 muestras
