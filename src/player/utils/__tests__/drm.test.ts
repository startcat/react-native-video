import type { IManifest } from "../../types/types";
import { getDRM } from "../drm";

jest.mock("react-native", () => ({ Platform: { OS: "android" } }), { virtual: true });
jest.mock("../../types", () => jest.requireActual("../../types/enums"));
jest.mock("../siteUrl", () => ({ getAbsoluteUri: (u: string) => u }));

describe("getDRM", () => {
	it.each(["widevine", "fairplay", "playready"])("copia drmConfig.headers (%s)", type => {
		const drm = getDRM({
			manifestURL: "https://h/m",
			drmConfig: {
				type,
				licenseAcquisitionURL: "https://h/l",
				headers: { "X-A": "1" },
			},
		} as unknown as IManifest);
		expect(drm?.headers).toEqual({ "X-A": "1" });
	});

	it("sin headers, headers es undefined", () => {
		const drm = getDRM({
			manifestURL: "https://h/m",
			drmConfig: { type: "widevine", licenseAcquisitionURL: "https://h/l" },
		} as unknown as IManifest);
		expect(drm?.headers).toBeUndefined();
		expect(drm?.licenseServer).toBe("https://h/l");
	});
});
