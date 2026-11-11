import { redactUrlTokens, redactHeaderNames } from "../redact";

describe("redactUrlTokens", () => {
	it("tapa token= en una URL", () => {
		expect(redactUrlTokens("https://h/dash?token=fmt_AB&x=1")).toBe(
			"https://h/dash?token=***&x=1"
		);
	});

	it("tapa fmt_ suelto, sin distinguir mayúsculas", () => {
		expect(redactUrlTokens("licencia FMT_abc-1_2")).toBe("licencia fmt_***");
	});

	it("tapa token codificado", () => {
		expect(redactUrlTokens("https://h/a%3Ftoken%3Dfmt_x%26y%3D1")).toBe(
			"https://h/a%3Ftoken%3D***%26y%3D1"
		);
	});

	it("tapa playbackToken en JSON, X-Playback-Token y Bearer", () => {
		expect(redactUrlTokens('{"playbackToken":"abc"}')).toBe('{"playbackToken":"***"}');
		expect(redactUrlTokens("X-Playback-Token: abc")).toBe("X-Playback-Token: ***");
		expect(redactUrlTokens("Bearer abc.def")).toBe("Bearer ***");
	});

	it("es idempotente y no toca texto sin secretos", () => {
		const once = redactUrlTokens("https://h/a?token=fmt_x&b=2");
		expect(redactUrlTokens(once)).toBe(once);
		expect(redactUrlTokens("https://h/a/b.mpd?start=1")).toBe("https://h/a/b.mpd?start=1");
	});
});

describe("redactHeaderNames", () => {
	it("deja solo los nombres de las cabeceras", () => {
		expect(redactHeaderNames({ "X-A": "secreto", "X-B": "otro" })).toEqual(["X-A", "X-B"]);
		expect(redactHeaderNames(undefined)).toEqual([]);
	});
});
