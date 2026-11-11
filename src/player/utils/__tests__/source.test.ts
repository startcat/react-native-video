import type { IManifest } from "../../types/types";
import { Platform } from "react-native";
import type { IPlayerMetadata } from "../../types/newTypes";
import { getManifestSourceType } from "../source";

jest.mock("react-native", () => ({ Platform: { OS: "android" } }), { virtual: true });
jest.mock("qs", () => ({ parse: jest.fn(), stringify: jest.fn() }), { virtual: true });
jest.mock("../../types", () => jest.requireActual("../../types/enums"));
jest.mock("../siteUrl", () => ({ getAbsoluteUri: (u: string) => u }));

const setOS = (os: string) => {
	(Platform as { OS: string }).OS = os;
};

describe("getManifestSourceType", () => {
	afterEach(() => setOS("android"));

	it("usa manifest.type hls -> m3u8 cuando la URL no tiene extensión (Android)", () => {
		expect(
			getManifestSourceType({
				manifestURL: "https://h/api/v1/playback-sessions/s/manifests/hls?token=fmt_x",
				type: "hls",
			} as unknown as IManifest)
		).toBe("m3u8");
	});

	it("usa manifest.type dash -> mpd en iOS", () => {
		setOS("ios");
		expect(
			getManifestSourceType({
				manifestURL: "https://h/api/v1/playback-sessions/s/manifests/dash?token=fmt_x",
				type: "dash",
			} as unknown as IManifest)
		).toBe("mpd");
	});

	it("usa manifest.type mp4", () => {
		expect(
			getManifestSourceType({
				manifestURL: "https://h/api/v1/playback-sessions/s/file?token=fmt_x",
				type: "mp4",
			} as unknown as IManifest)
		).toBe("mp4");
	});

	it("la extensión de la URL manda sobre manifest.type", () => {
		expect(
			getManifestSourceType({
				manifestURL: "https://h/a/b.mpd",
				type: "hls",
			} as unknown as IManifest)
		).toBe("mpd");
	});

	it("sin extensión ni type, vale lo de hoy por plataforma", () => {
		expect(getManifestSourceType({ manifestURL: "https://h/x" } as unknown as IManifest)).toBe(
			"mpd"
		);
		setOS("ios");
		expect(getManifestSourceType({ manifestURL: "https://h/x" } as unknown as IManifest)).toBe(
			"m3u8"
		);
	});
});

describe("IPlayerMetadata", () => {
	it("acepta un id de texto (el tipo se comprueba al compilar con tsc)", () => {
		const metadata: IPlayerMetadata = { id: "uuid", slug: "s", title: "t" };
		expect(metadata.id).toBe("uuid");
	});
});
