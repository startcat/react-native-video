import { ErrorMapper } from "../../utils/ErrorMapper";
import { DownloadErrorCode } from "../../types";

describe("ErrorMapper — Contrato público", () => {
	// --- mapToErrorCode ---

	describe("mapToErrorCode", () => {
		it("#1 error de espacio → INSUFFICIENT_SPACE", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("no space left on device"))).toBe(
				DownloadErrorCode.INSUFFICIENT_SPACE
			);
			expect(ErrorMapper.mapToErrorCode(new Error("disk full"))).toBe(
				DownloadErrorCode.INSUFFICIENT_SPACE
			);
		});

		it("#2 error de red → NETWORK_ERROR", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("network unreachable"))).toBe(
				DownloadErrorCode.NETWORK_ERROR
			);
			expect(ErrorMapper.mapToErrorCode(new Error("connection refused"))).toBe(
				DownloadErrorCode.NETWORK_ERROR
			);
		});

		it("#3 error timeout → TIMEOUT", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("request timed out"))).toBe(
				DownloadErrorCode.TIMEOUT
			);
		});

		it("#4 error DRM → DRM_ERROR", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("DRM license error"))).toBe(
				DownloadErrorCode.DRM_ERROR
			);
			expect(ErrorMapper.mapToErrorCode(new Error("widevine failed"))).toBe(
				DownloadErrorCode.DRM_ERROR
			);
		});

		it("#5 error permisos → PERMISSION_DENIED", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("permission denied"))).toBe(
				DownloadErrorCode.PERMISSION_DENIED
			);
		});

		it("#6 error URL → INVALID_URL", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("invalid url provided"))).toBe(
				DownloadErrorCode.INVALID_URL
			);
		});

		it("#7 error cancelación → CANCELLED", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("download cancelled"))).toBe(
				DownloadErrorCode.CANCELLED
			);
			expect(ErrorMapper.mapToErrorCode(new Error("operation aborted"))).toBe(
				DownloadErrorCode.CANCELLED
			);
		});

		it("#8 error genérico → UNKNOWN", () => {
			expect(ErrorMapper.mapToErrorCode(new Error("something went wrong"))).toBe(
				DownloadErrorCode.UNKNOWN
			);
		});
	});

	// --- isRetryable ---

	describe("isRetryable", () => {
		it("#9 NETWORK_ERROR → true (retryable)", () => {
			expect(ErrorMapper.isRetryable(DownloadErrorCode.NETWORK_ERROR)).toBe(true);
		});

		it("#10 INSUFFICIENT_SPACE → false (not retryable)", () => {
			expect(ErrorMapper.isRetryable(DownloadErrorCode.INSUFFICIENT_SPACE)).toBe(false);
			expect(ErrorMapper.isRetryable(DownloadErrorCode.DRM_ERROR)).toBe(false);
			expect(ErrorMapper.isRetryable(DownloadErrorCode.INVALID_URL)).toBe(false);
			expect(ErrorMapper.isRetryable(DownloadErrorCode.PERMISSION_DENIED)).toBe(false);
			expect(ErrorMapper.isRetryable(DownloadErrorCode.CANCELLED)).toBe(false);
		});
	});

	// --- getUserMessage ---

	describe("getUserMessage", () => {
		it("#11 cada código → mensaje en castellano", () => {
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.INSUFFICIENT_SPACE)).toContain(
				"espacio"
			);
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.NETWORK_ERROR)).toContain(
				"conexión"
			);
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.TIMEOUT)).toContain("tardó");
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.DRM_ERROR)).toContain("licencia");
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.PERMISSION_DENIED)).toContain(
				"permisos"
			);
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.INVALID_URL)).toContain("URL");
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.CANCELLED)).toContain("cancelada");
		});

		it("#12 UNKNOWN → 'Error desconocido'", () => {
			expect(ErrorMapper.getUserMessage(DownloadErrorCode.UNKNOWN)).toBe("Error desconocido");
		});
	});
});
