/*
 * Utilidades para convertir valores numéricos a strings legibles
 *
 */

/*
 * Convierte bytes por segundo a un formato legible de velocidad
 *
 * @param bytesPerSecond - Velocidad en bytes por segundo
 * @param decimals - Número de decimales (por defecto 2)
 * @returns String formateado (ej: "11.41 MB/s", "1.5 GB/s")
 *
 * @example
 * formatDownloadSpeed(11408755.424063116) // "11.41 MB/s"
 * formatDownloadSpeed(1024) // "1.02 KB/s"
 * formatDownloadSpeed(0) // "0 B/s"
 *
 */

export function formatDownloadSpeed(bytesPerSecond: number, decimals: number = 2): string {
	if (bytesPerSecond === 0) return "0 B/s";
	if (bytesPerSecond < 0) return "N/A";

	const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
	const k = 1000; // Usar 1000 en lugar de 1024 para velocidades de red (estándar SI)

	const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
	const value = bytesPerSecond / Math.pow(k, i);

	return `${value.toFixed(decimals)} ${units[i]}`;
}

/*
 * Convierte segundos a un formato legible de tiempo
 * @param seconds - Tiempo en segundos
 * @param showSeconds - Si se deben mostrar los segundos (por defecto true)
 * @returns String formateado (ej: "7m 11s", "2h 15m", "45s")
 *
 * @example
 * formatRemainingTime(431) // "7m 11s"
 * formatRemainingTime(7265) // "2h 1m 5s"
 * formatRemainingTime(45) // "45s"
 * formatRemainingTime(7265, false) // "2h 1m"
 *
 */

export function formatRemainingTime(seconds: number, showSeconds: boolean = true): string {
	if (seconds <= 0 || !isFinite(seconds)) return "N/A";

	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	const parts: string[] = [];

	if (hours > 0) {
		parts.push(`${hours}h`);
	}

	if (minutes > 0 || hours > 0) {
		parts.push(`${minutes}m`);
	}

	if (showSeconds && (secs > 0 || parts.length === 0)) {
		parts.push(`${secs}s`);
	}

	return parts.join(" ");
}

/*
 * Convierte bytes a un formato legible de tamaño de archivo
 * @param bytes - Tamaño en bytes
 * @param decimals - Número de decimales (por defecto 2)
 * @param useBinary - Usar base binaria (1024) en lugar de decimal (1000) (por defecto true)
 * @returns String formateado (ej: "5.06 GB", "142.05 MB")
 *
 * @example
 * formatFileSize(5063702600) // "4.72 GB" (binario)
 * formatFileSize(5063702600, 2, false) // "5.06 GB" (decimal)
 * formatFileSize(142050413) // "135.47 MB"
 * formatFileSize(1024) // "1.00 KB"
 *
 */

export function formatFileSize(
	bytes: number,
	decimals: number = 2,
	useBinary: boolean = false
): string {
	if (bytes === 0) return "0 B";
	if (bytes < 0) return "N/A";

	const k = useBinary ? 1024 : 1000;
	const units = useBinary
		? ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
		: ["B", "KB", "MB", "GB", "TB", "PB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const value = bytes / Math.pow(k, i);

	return `${value.toFixed(decimals)} ${units[i]}`;
}

/*
 * Convierte un porcentaje a un string formateado
 * @param percentage - Porcentaje (0-100)
 * @param decimals - Número de decimales (por defecto 1)
 * @returns String formateado (ej: "91.1%", "100.0%")
 *
 * @example
 * formatPercentage(91.108) // "91.1%"
 * formatPercentage(100) // "100.0%"
 * formatPercentage(0.5, 2) // "0.50%"
 *
 */

export function formatPercentage(percentage: number, decimals: number = 1): string {
	if (percentage < 0 || percentage > 100 || !isFinite(percentage)) {
		return "N/A";
	}

	return `${percentage.toFixed(decimals)}%`;
}

/*
 * Formatea información completa de progreso de descarga
 * @param bytesDownloaded - Bytes descargados
 * @param totalBytes - Bytes totales
 * @param speed - Velocidad en bytes/segundo
 * @param remainingTime - Tiempo restante en segundos
 * @returns Objeto con todos los valores formateados
 *
 * @example
 * formatDownloadProgress(142050413, 5063702600, 11408755.424063116, 431)
 * // {
 * //   downloaded: "135.47 MB",
 * //   total: "4.72 GB",
 * //   percentage: "2.8%",
 * //   speed: "11.41 MB/s",
 * //   remainingTime: "7m 11s",
 * //   ratio: "135.47 MB / 4.72 GB"
 * // }
 *
 */

export function formatDownloadProgress(
	bytesDownloaded: number,
	totalBytes: number,
	speed: number,
	remainingTime: number
): {
	downloaded: string;
	total: string;
	percentage: string;
	speed: string;
	remainingTime: string;
	ratio: string;
} {
	const downloaded = formatFileSize(bytesDownloaded);
	const total = formatFileSize(totalBytes);
	const percentage =
		totalBytes > 0 ? formatPercentage((bytesDownloaded / totalBytes) * 100) : "N/A";

	return {
		downloaded,
		total,
		percentage,
		speed: formatDownloadSpeed(speed),
		remainingTime: formatRemainingTime(remainingTime),
		ratio: `${downloaded} / ${total}`,
	};
}

/*
 * Convierte milisegundos a un formato legible de duración
 * @param milliseconds - Duración en milisegundos
 * @returns String formateado (ej: "5m 30s", "1h 15m")
 *
 * @example
 * formatDuration(330000) // "5m 30s"
 * formatDuration(4500000) // "1h 15m"
 *
 */

export function formatDuration(milliseconds: number): string {
	return formatRemainingTime(Math.floor(milliseconds / 1000));
}
