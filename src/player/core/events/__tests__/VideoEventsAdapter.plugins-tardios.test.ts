import { VideoEventsAdapter } from "../VideoEventsAdapter";

jest.mock(
	"@overon/react-native-overon-player-analytics-plugins",
	() => ({
		PlayerAnalyticsEvents: jest.fn(),
		createHandlerError: (code: string) => new Error(code),
	}),
	{ virtual: true }
);

const buildAnalyticsEvents = () => ({ on: jest.fn() });

const buildPluginV2 = () => ({
	name: "adobe",
	version: "0.0.0",
	on: jest.fn(),
	destroy: jest.fn(),
});

describe("plugins registrados con la sesion ya abierta (EITB-1702)", () => {
	// El host puede recrear los plugins en mitad de la reproduccion (react-query
	// entrega un `data` nuevo). onCreatePlaybackSession solo se emitio una vez, asi
	// que los plugins nuevos no sabian que habia una sesion en curso.
	it("reciben onCreatePlaybackSession al registrarse si la sesion ya ha arrancado", () => {
		const adapter = new VideoEventsAdapter(buildAnalyticsEvents() as never);
		adapter.onLoadStart({} as never);

		const tardio = buildPluginV2();
		adapter.primeLateRegisteredPlugins([tardio as never]);

		expect(tardio.on).toHaveBeenCalledWith("onCreatePlaybackSession", undefined);
	});

	it("no hace nada si la sesion aun no ha arrancado", () => {
		const adapter = new VideoEventsAdapter(buildAnalyticsEvents() as never);

		const tardio = buildPluginV2();
		adapter.primeLateRegisteredPlugins([tardio as never]);

		expect(tardio.on).not.toHaveBeenCalled();
	});

	it("tolera plugins legacy sin on()", () => {
		const adapter = new VideoEventsAdapter(buildAnalyticsEvents() as never);
		adapter.onLoadStart({} as never);

		const legacy = { name: "legacy", version: "1" };
		expect(() => adapter.primeLateRegisteredPlugins([legacy as never])).not.toThrow();
	});
});
