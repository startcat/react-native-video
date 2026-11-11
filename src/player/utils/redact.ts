/**
 * Tapa los secretos de reproducción de un texto que va a un log. Es idempotente.
 * Mismas reglas que `redactSecrets` de la app:
 * - `token=<valor>` (al principio o tras un carácter que no sea de palabra), también codificado
 *   (`token%3D<valor>`);
 * - todo `fmt_…` (token de manifiesto y licencia), sin distinguir mayúsculas;
 * - `"playbackToken":"…"`, también con comillas escapadas;
 * - `X-Playback-Token: <valor>` y `Bearer <valor>`.
 */
export function redactUrlTokens(text: string): string {
	if (typeof text !== "string") {
		return text;
	}

	return text
		.replace(/(^|\W|%3F|%26|%3B)(token(?:=|%3D))(?:(?!%26)[^&\s"'#])*/gi, "$1$2***")
		.replace(/fmt_[A-Za-z0-9_-]+/gi, "fmt_***")
		.replace(/(\\*"playbackToken\\*"\s*:\s*\\*")[^"\\]*/gi, "$1***")
		.replace(/(x-playback-token["']?\s*[:=]\s*["']?)[^\s"',;}&]+/gi, "$1***")
		.replace(/(\bbearer\s+)[^\s"',;}&]+/gi, "$1***");
}

/** Nombres de las cabeceras, sin sus valores (los valores pueden ser credenciales). */
export function redactHeaderNames(headers?: Record<string, unknown> | null): string[] {
	return headers && typeof headers === "object" ? Object.keys(headers) : [];
}

/** JSON de un objeto para un log: sin tokens en las URLs y con las cabeceras solo por nombre. */
export function redactJsonForLog(value: unknown): string {
	const json = JSON.stringify(value, (key, v) =>
		key === "headers" && v && typeof v === "object" && !Array.isArray(v)
			? { names: redactHeaderNames(v) }
			: v
	);

	return redactUrlTokens(json ?? "undefined");
}
