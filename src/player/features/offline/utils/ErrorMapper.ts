/*
 * ErrorMapper centralizado para el sistema de descargas offline
 * Proporciona mapeo consistente de errores a códigos estandarizados
 *
 */

import { DownloadErrorCode } from "../types";

/**
 * Mapea errores nativos y de red a códigos de error estandarizados
 */
export class ErrorMapper {
	/**
	 * Mapea un error a un DownloadErrorCode
	 */
	static mapToErrorCode(error: unknown): DownloadErrorCode {
		const errorMessage = this.extractErrorMessage(error);
		const errorCode = this.extractNativeCode(error);

		// Errores de espacio
		if (this.isNoSpaceError(errorMessage, errorCode)) {
			return DownloadErrorCode.INSUFFICIENT_SPACE;
		}

		// Errores de red
		if (this.isNetworkError(errorMessage, errorCode)) {
			return DownloadErrorCode.NETWORK_ERROR;
		}

		// Errores de timeout
		if (this.isTimeoutError(errorMessage, errorCode)) {
			return DownloadErrorCode.TIMEOUT;
		}

		// Errores de DRM
		if (this.isDRMError(errorMessage, errorCode)) {
			return DownloadErrorCode.DRM_ERROR;
		}

		// Errores de permisos
		if (this.isPermissionError(errorMessage, errorCode)) {
			return DownloadErrorCode.PERMISSION_DENIED;
		}

		// Errores de URL inválida
		if (this.isInvalidUrlError(errorMessage, errorCode)) {
			return DownloadErrorCode.INVALID_URL;
		}

		// Errores de cancelación
		if (this.isCancelledError(errorMessage, errorCode)) {
			return DownloadErrorCode.CANCELLED;
		}

		// Error genérico
		return DownloadErrorCode.UNKNOWN;
	}

	/**
	 * Determina si un error es reintentable
	 */
	static isRetryable(errorCode: DownloadErrorCode): boolean {
		const nonRetryable: DownloadErrorCode[] = [
			DownloadErrorCode.INSUFFICIENT_SPACE,
			DownloadErrorCode.DRM_ERROR,
			DownloadErrorCode.INVALID_URL,
			DownloadErrorCode.PERMISSION_DENIED,
			DownloadErrorCode.CANCELLED,
		];
		return !nonRetryable.includes(errorCode);
	}

	/**
	 * Obtiene un mensaje legible para el usuario
	 */
	static getUserMessage(errorCode: DownloadErrorCode): string {
		const messages: Partial<Record<DownloadErrorCode, string>> = {
			[DownloadErrorCode.INSUFFICIENT_SPACE]: "No hay espacio suficiente en el dispositivo",
			[DownloadErrorCode.NETWORK_ERROR]: "Error de conexión. Verifica tu conexión a internet",
			[DownloadErrorCode.TIMEOUT]: "La descarga tardó demasiado. Intenta de nuevo",
			[DownloadErrorCode.DRM_ERROR]: "Error de licencia. El contenido no puede descargarse",
			[DownloadErrorCode.PERMISSION_DENIED]: "No hay permisos para guardar el archivo",
			[DownloadErrorCode.INVALID_URL]: "La URL del contenido no es válida",
			[DownloadErrorCode.CANCELLED]: "La descarga fue cancelada",
			[DownloadErrorCode.UNKNOWN]: "Error desconocido",
		};
		return messages[errorCode] || "Error desconocido";
	}

	// Métodos privados de extracción
	private static extractErrorMessage(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === "string") return error;
		if (error && typeof error === "object" && "message" in error) {
			return String((error as { message: unknown }).message);
		}
		return String(error);
	}

	private static extractNativeCode(error: unknown): number | string | null {
		if (error && typeof error === "object") {
			if ("code" in error) {
				const code = (error as { code: unknown }).code;
				if (typeof code === "number" || typeof code === "string") {
					return code;
				}
			}
			if ("errorCode" in error) {
				const code = (error as { errorCode: unknown }).errorCode;
				if (typeof code === "number" || typeof code === "string") {
					return code;
				}
			}
		}
		return null;
	}

	// Métodos privados de detección
	private static isNoSpaceError(message: string, code: number | string | null): boolean {
		const keywords = [
			"no space",
			"disk full",
			"storage full",
			"enospc",
			"insufficient storage",
			"no hay espacio",
		];
		const codes = [28, -28, "ENOSPC", "NO_SPACE_LEFT", "DOWNLOAD_NO_SPACE"];
		const lowerMessage = message.toLowerCase();
		return (
			keywords.some(k => lowerMessage.includes(k)) ||
			(code !== null && codes.includes(code as never))
		);
	}

	private static isNetworkError(message: string, _code: number | string | null): boolean {
		const keywords = [
			"network",
			"connection",
			"unreachable",
			"enetunreach",
			"econnrefused",
			"econnreset",
			"socket",
			"dns",
		];
		const lowerMessage = message.toLowerCase();
		return keywords.some(k => lowerMessage.includes(k));
	}

	private static isTimeoutError(message: string, _code: number | string | null): boolean {
		const keywords = ["timeout", "timed out", "etimedout"];
		const lowerMessage = message.toLowerCase();
		return keywords.some(k => lowerMessage.includes(k));
	}

	private static isDRMError(message: string, _code: number | string | null): boolean {
		const keywords = ["drm", "license", "widevine", "fairplay", "playready"];
		const lowerMessage = message.toLowerCase();
		return keywords.some(k => lowerMessage.includes(k));
	}

	private static isPermissionError(message: string, code: number | string | null): boolean {
		const keywords = ["permission", "eacces", "access denied", "not allowed"];
		const codes = [13, -13, "EACCES"];
		const lowerMessage = message.toLowerCase();
		return (
			keywords.some(k => lowerMessage.includes(k)) ||
			(code !== null && codes.includes(code as never))
		);
	}

	private static isInvalidUrlError(message: string, _code: number | string | null): boolean {
		const keywords = ["invalid url", "malformed", "bad url", "url not valid"];
		const lowerMessage = message.toLowerCase();
		return keywords.some(k => lowerMessage.includes(k));
	}

	private static isCancelledError(message: string, _code: number | string | null): boolean {
		const keywords = ["cancelled", "canceled", "aborted", "stopped"];
		const lowerMessage = message.toLowerCase();
		return keywords.some(k => lowerMessage.includes(k));
	}
}
