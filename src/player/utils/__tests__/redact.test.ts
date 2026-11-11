import { redactHeaderNames, redactJsonForLog, redactUrlTokens } from "../redact";

// Los vectores de redactUrlTokens son los de redact-secrets.test.ts de la app (joyful-mobile).
describe("redactUrlTokens", () => {
	it("tapa el token de un manifiesto", () => {
		expect(
			redactUrlTokens(
				"https://h/api/v1/playback-sessions/s/manifests/dash?token=fmt_AAAA&x=1"
			)
		).toBe("https://h/api/v1/playback-sessions/s/manifests/dash?token=***&x=1");
	});

	it("en una licencia conserva system y keyId", () => {
		expect(
			redactUrlTokens("https://h/joyful-license?token=fmt_B&system=widevine&keyId=k1")
		).toBe("https://h/joyful-license?token=***&system=widevine&keyId=k1");
	});

	it("tapa un fmt_ suelto", () => {
		expect(redactUrlTokens("valor fmt_abc-1_Z fin")).toBe("valor fmt_*** fin");
	});

	it("tapa playbackToken en JSON", () => {
		expect(redactUrlTokens('{"playbackToken":"secret"}')).toBe('{"playbackToken":"***"}');
	});

	it("es idempotente", () => {
		const once = redactUrlTokens('a?token=fmt_A&b=1 fmt_B {"playbackToken":"s"}');
		expect(redactUrlTokens(once)).toBe(once);
	});

	it("no cambia un texto sin secretos", () => {
		expect(redactUrlTokens("GET /profiles/p1/my-list?limit=3")).toBe(
			"GET /profiles/p1/my-list?limit=3"
		);
	});

	describe("formas adicionales", () => {
		it.each([
			["token=abc123&x=1", "token=***&x=1"],
			["uri: token=abc123", "uri: token=***"],
			["a/b,token=abc123", "a/b,token=***"],
			["https://h/m?x=1&Token=abc", "https://h/m?x=1&Token=***"],
		])("token= en cualquier posición: %s", (input, expected) => {
			expect(redactUrlTokens(input)).toBe(expected);
		});

		it("token%3D con valor opaco", () => {
			expect(
				redactUrlTokens("https://h/p?u=https%3A%2F%2Fh%2Fm%3Ftoken%3DopaqueValue1%26x%3D1")
			).toBe("https://h/p?u=https%3A%2F%2Fh%2Fm%3Ftoken%3D***%26x%3D1");
			expect(redactUrlTokens("a?token%3Dopaque&b=2")).toBe("a?token%3D***&b=2");
		});

		it("fmt_ sin distinguir mayúsculas", () => {
			expect(redactUrlTokens("FMT_abc y Fmt_def")).toBe("fmt_*** y fmt_***");
		});

		it("playbackToken en JSON escapado y con espacios", () => {
			expect(redactUrlTokens('{\\"playbackToken\\":\\"secret\\"}')).toBe(
				'{\\"playbackToken\\":\\"***\\"}'
			);
			expect(redactUrlTokens('{"playbackToken": "secret"}')).toBe('{"playbackToken": "***"}');
		});

		it("X-Playback-Token y Authorization en texto", () => {
			expect(redactUrlTokens("headers X-Playback-Token: pt-secret ok")).toBe(
				"headers X-Playback-Token: *** ok"
			);
			expect(redactUrlTokens("Authorization: Bearer abc.def.ghi")).toBe(
				"Authorization: Bearer ***"
			);
		});

		it("todas las formas son idempotentes", () => {
			const text =
				'token=a token%3Db FMT_c {\\"playbackToken\\":\\"d\\"} {"playbackToken": "e"} X-Playback-Token: f Bearer g';
			const once = redactUrlTokens(text);
			expect(redactUrlTokens(once)).toBe(once);
		});
	});
});

describe("redactHeaderNames", () => {
	it("deja solo los nombres de las cabeceras", () => {
		expect(redactHeaderNames({ "X-A": "secreto", "X-B": "otro" })).toEqual(["X-A", "X-B"]);
		expect(redactHeaderNames(undefined)).toEqual([]);
	});
});

describe("redactJsonForLog", () => {
	it("tapa tokens de la URI y deja las cabeceras solo por nombre", () => {
		const out = redactJsonForLog({
			source: { uri: "https://h/dash?token=fmt_Z&x=1" },
			drm: { headers: { "X-A": "valor-secreto" } },
		});
		expect(out).toContain("token=***");
		expect(out).not.toContain("fmt_Z");
		expect(out).not.toContain("valor-secreto");
		expect(out).toContain("X-A");
	});
});
