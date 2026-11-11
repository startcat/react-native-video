import { ErrorEventsHandler } from "../ErrorEventsHandler";

import type { OnVideoErrorData } from "../../../../../specs/VideoNativeComponent";

// El paquete externo solo se importa por tipos; en el test mockeamos la clase
// para inyectar un objeto con los métodos que el handler invoca.
jest.mock(
	"@overon/react-native-overon-player-analytics-plugins",
	() => ({ PlayerAnalyticsEvents: jest.fn() }),
	{ virtual: true }
);

const TOKEN_URL =
	"https://web.example.com/api/v1/playback-sessions/s1/manifests/dash?token=fmt_secretoDeManifiesto123";

function buildErrorData(error: Record<string, unknown>): OnVideoErrorData {
	return { error } as unknown as OnVideoErrorData;
}

describe("ErrorEventsHandler — sin tokens hacia los plugins", () => {
	let on: jest.Mock;
	let handler: ErrorEventsHandler;

	beforeEach(() => {
		on = jest.fn();
		handler = new ErrorEventsHandler({ on } as never);
	});

	it("tapa el token de la URL y del mensaje en un error de red", () => {
		handler.handleError(
			buildErrorData({
				code: "-1009",
				localizedDescription: `network connection lost: ${TOKEN_URL}`,
				url: TOKEN_URL,
			})
		);

		const [event, payload] = on.mock.calls[0];
		expect(event).toBe("onNetworkError");
		expect(JSON.stringify(payload)).not.toContain("fmt_secretoDeManifiesto123");
		expect(payload.url).toContain("token=***");
		expect(payload.errorMessage).toContain("token=***");
	});

	it("tapa el token de la URL del stream y del mensaje en un error de stream", () => {
		handler.handleError(
			buildErrorData({
				code: "22004",
				localizedDescription: `manifest failed: ${TOKEN_URL}`,
				manifestUrl: TOKEN_URL,
			})
		);

		const [event, payload] = on.mock.calls[0];
		expect(event).toBe("onStreamError");
		expect(JSON.stringify(payload)).not.toContain("fmt_secretoDeManifiesto123");
		expect(payload.streamUrl).toContain("token=***");
	});

	it("tapa el token del mensaje en los errores de DRM y en los demás", () => {
		handler.handleError(
			buildErrorData({ code: "1", localizedDescription: `license denied ${TOKEN_URL}` })
		);
		handler.handleError(
			buildErrorData({
				code: "2",
				localizedDescription:
					"boom https://cdn.example.com/x?token=fmt_secretoDeManifiesto123",
			})
		);

		expect(on.mock.calls[0][0]).toBe("onContentProtectionError");
		expect(on.mock.calls[1][0]).toBe("onError");
		expect(JSON.stringify(on.mock.calls)).not.toContain("fmt_secretoDeManifiesto123");
	});

	it("deja intactos los campos sin URL", () => {
		handler.handleError(
			buildErrorData({ code: "-1009", localizedDescription: "network down" })
		);

		const [, payload] = on.mock.calls[0];
		expect(payload.errorMessage).toBe("network down");
		expect(payload.url).toBeUndefined();
	});
});
