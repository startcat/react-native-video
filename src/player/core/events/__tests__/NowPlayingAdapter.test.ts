import { NowPlayingState } from "@overon/react-native-overon-player-now-playing";

import {
	NowPlayingAdapter,
	resolveNowPlayingCommand,
	toNowPlayingCapabilities,
	toNowPlayingMetadata,
	toNowPlayingState,
	type NowPlayingCommandSink,
	type NowPlayingControlApi,
} from "../NowPlayingAdapter";

// El módulo nativo solo se usa por tipos + el enum NowPlayingState en runtime;
// lo mockeamos para no cargar el ESM real (no transformado por jest).
jest.mock(
	"@overon/react-native-overon-player-now-playing",
	() => ({
		NowPlayingState: {
			NONE: "none",
			PLAYING: "playing",
			PAUSED: "paused",
			STOPPED: "stopped",
			BUFFERING: "buffering",
		},
	}),
	{ virtual: true }
);

describe("toNowPlayingMetadata", () => {
	const source = {
		title: "El Partido",
		subtitle: "Liga 24/25",
		artist: "Movistar",
		poster: "https://img/rect.jpg",
		squaredPoster: "https://img/square.jpg",
	};

	it("mapea title, artist y artwork (squaredPoster preferido sobre poster)", () => {
		const meta = toNowPlayingMetadata(source, { duration: 120, currentTime: 30 });
		expect(meta.title).toBe("El Partido");
		expect(meta.artist).toBe("Movistar");
		expect(meta.artworkUrl).toBe("https://img/square.jpg");
		expect(meta.duration).toBe(120);
		expect(meta.currentTime).toBe(30);
	});

	it("usa poster cuando no hay squaredPoster", () => {
		const meta = toNowPlayingMetadata({ ...source, squaredPoster: undefined }, {});
		expect(meta.artworkUrl).toBe("https://img/rect.jpg");
	});

	it("cae a subtitle como artist cuando artist falta", () => {
		const meta = toNowPlayingMetadata({ title: "T", subtitle: "Sub" }, {});
		expect(meta.artist).toBe("Sub");
	});

	it("title vacío cuando no hay fuente de título (campo requerido por el módulo)", () => {
		const meta = toNowPlayingMetadata({}, {});
		expect(meta.title).toBe("");
	});

	it("propaga isLive y omite duration<=0", () => {
		const meta = toNowPlayingMetadata(source, { isLive: true, duration: 0 });
		expect(meta.isLive).toBe(true);
		expect(meta.duration).toBeUndefined();
	});
});

describe("toNowPlayingCapabilities", () => {
	it("VOD: canSeek true, play/pause true, sin next/prev", () => {
		const caps = toNowPlayingCapabilities({ isLive: false });
		expect(caps.canSeek).toBe(true);
		expect(caps.canPlayPause).toBe(true);
		expect(caps.canSkipNext).toBe(false);
		expect(caps.canSkipPrevious).toBe(false);
	});

	it("live sin DVR: canSeek false (preserva PLAYER-50)", () => {
		expect(toNowPlayingCapabilities({ isLive: true }).canSeek).toBe(false);
	});

	it("live con DVR: canSeek true", () => {
		expect(toNowPlayingCapabilities({ isLive: true, isDVR: true }).canSeek).toBe(true);
	});
});

describe("toNowPlayingState", () => {
	it("buffering tiene prioridad", () => {
		expect(toNowPlayingState({ buffering: true, paused: true })).toBe(
			NowPlayingState.BUFFERING
		);
	});
	it("ended -> STOPPED", () => {
		expect(toNowPlayingState({ ended: true })).toBe(NowPlayingState.STOPPED);
	});
	it("paused -> PAUSED", () => {
		expect(toNowPlayingState({ paused: true })).toBe(NowPlayingState.PAUSED);
	});
	it("reproduciendo -> PLAYING", () => {
		expect(toNowPlayingState({})).toBe(NowPlayingState.PLAYING);
	});
});

describe("resolveNowPlayingCommand", () => {
	let sink: NowPlayingCommandSink & {
		seekTo: jest.Mock;
		setPaused: jest.Mock;
		getPaused: jest.Mock;
	};

	beforeEach(() => {
		sink = {
			seekTo: jest.fn(),
			setPaused: jest.fn(),
			getPaused: jest.fn().mockReturnValue(false),
		};
	});

	it("play -> setPaused(false)", () => {
		resolveNowPlayingCommand("play", undefined, sink);
		expect(sink.setPaused).toHaveBeenCalledWith(false);
	});

	it("pause -> setPaused(true)", () => {
		resolveNowPlayingCommand("pause", undefined, sink);
		expect(sink.setPaused).toHaveBeenCalledWith(true);
	});

	it("togglePlayPause invierte el estado actual", () => {
		sink.getPaused.mockReturnValue(true);
		resolveNowPlayingCommand("togglePlayPause", undefined, sink);
		expect(sink.setPaused).toHaveBeenCalledWith(false);
	});

	it("seekTo usa data.position (segundos absolutos)", () => {
		resolveNowPlayingCommand("seekTo", { position: 42 }, sink);
		expect(sink.seekTo).toHaveBeenCalledWith(42);
	});

	it("seekTo sin position no hace nada", () => {
		resolveNowPlayingCommand("seekTo", undefined, sink);
		expect(sink.seekTo).not.toHaveBeenCalled();
	});

	it("next/previous son no-op (RNV vídeo único)", () => {
		resolveNowPlayingCommand("next", undefined, sink);
		resolveNowPlayingCommand("previous", undefined, sink);
		expect(sink.seekTo).not.toHaveBeenCalled();
		expect(sink.setPaused).not.toHaveBeenCalled();
	});
});

describe("NowPlayingAdapter (lifecycle + control wiring)", () => {
	let control: NowPlayingControlApi & Record<string, jest.Mock>;
	let sink: NowPlayingCommandSink;

	beforeEach(() => {
		control = {
			enable: jest.fn(),
			disable: jest.fn(),
			update: jest.fn(),
			updateState: jest.fn(),
			setCommandHandler: jest.fn(),
			removeCommandHandler: jest.fn(),
		};
		sink = {
			seekTo: jest.fn(),
			setPaused: jest.fn(),
			getPaused: jest.fn().mockReturnValue(false),
		};
	});

	it("start() habilita y registra el command handler", () => {
		const a = new NowPlayingAdapter(control, sink);
		a.start();
		expect(control.enable).toHaveBeenCalledTimes(1);
		expect(control.setCommandHandler).toHaveBeenCalledTimes(1);
	});

	it("syncMetadata empuja update() con metadata+estado+capabilities mapeados", () => {
		const a = new NowPlayingAdapter(control, sink);
		a.syncMetadata({ title: "T", artist: "A" }, { isLive: false, paused: false, duration: 10 });
		expect(control.update).toHaveBeenCalledWith(
			expect.objectContaining({ title: "T", artist: "A", duration: 10 }),
			NowPlayingState.PLAYING,
			expect.objectContaining({ canSeek: true })
		);
	});

	it("syncState empuja solo updateState()", () => {
		const a = new NowPlayingAdapter(control, sink);
		a.syncState({ paused: true });
		expect(control.updateState).toHaveBeenCalledWith(NowPlayingState.PAUSED);
		expect(control.update).not.toHaveBeenCalled();
	});

	it("el command handler registrado enruta a la sink", () => {
		const a = new NowPlayingAdapter(control, sink);
		a.start();
		const handler = (control.setCommandHandler as jest.Mock).mock.calls[0][0];
		handler("seekTo", { position: 7 });
		expect(sink.seekTo).toHaveBeenCalledWith(7);
	});

	it("stop() quita el handler y deshabilita", () => {
		const a = new NowPlayingAdapter(control, sink);
		a.start();
		a.stop();
		expect(control.removeCommandHandler).toHaveBeenCalledTimes(1);
		expect(control.disable).toHaveBeenCalledTimes(1);
	});
});
