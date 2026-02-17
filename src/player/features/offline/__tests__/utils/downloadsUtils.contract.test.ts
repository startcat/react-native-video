import {
	generateDownloadIdFromUri,
	normalizeUri,
	isValidUri,
	calculateRemainingTime,
	ensureDownloadId,
} from "../../utils/downloadsUtils";
import { DownloadType } from "../../types";

describe("downloadsUtils — Contrato público", () => {
	// --- generateDownloadIdFromUri ---

	describe("generateDownloadIdFromUri", () => {
		it("#1 URI válida → genera ID con prefijo download-", () => {
			const id = generateDownloadIdFromUri("https://example.com/video.mp4");

			expect(id).toMatch(/^download-/);
			expect(id.length).toBeGreaterThan(0);
		});

		it("#2 misma URI → mismo ID siempre (determinista)", () => {
			const uri = "https://example.com/video.mp4";
			const id1 = generateDownloadIdFromUri(uri);
			const id2 = generateDownloadIdFromUri(uri);

			expect(id1).toBe(id2);
		});

		it("#3 URIs diferentes → IDs diferentes", () => {
			const id1 = generateDownloadIdFromUri("https://example.com/video1.mp4");
			const id2 = generateDownloadIdFromUri("https://example.com/video2.mp4");

			expect(id1).not.toBe(id2);
		});

		it("#4 limpia protocolo, query string y fragment", () => {
			const id = generateDownloadIdFromUri("https://example.com/video.mp4?token=abc#section");
			const idClean = generateDownloadIdFromUri("https://example.com/video.mp4");

			expect(id).toBe(idClean);
		});

		it("#5 URI larga (>100 chars) → trunca con hash", () => {
			const longPath = "a".repeat(120);
			const id = generateDownloadIdFromUri(`https://example.com/${longPath}.mp4`);

			// Should be truncated but still valid
			expect(id).toMatch(/^download-/);
			expect(id.length).toBeLessThan(200);
		});
	});

	// --- normalizeUri ---

	describe("normalizeUri", () => {
		it("#6 normaliza mayúsculas y elimina fragment", () => {
			const normalized = normalizeUri("HTTPS://Example.COM/Video.mp4#section");

			expect(normalized).toBe("https://example.com/video.mp4");
		});

		it("#7 trim de espacios", () => {
			const normalized = normalizeUri("  https://example.com/video.mp4  ");

			expect(normalized).toBe("https://example.com/video.mp4");
		});
	});

	// --- isValidUri ---

	describe("isValidUri", () => {
		it("#8 http/https → true", () => {
			expect(isValidUri("https://example.com/video.mp4")).toBe(true);
			expect(isValidUri("http://example.com/video.mp4")).toBe(true);
		});

		it("#9 string vacío → false", () => {
			expect(isValidUri("")).toBe(false);
		});

		it("#10 ftp:// → false", () => {
			expect(isValidUri("ftp://example.com/file")).toBe(false);
		});
	});

	// --- calculateRemainingTime ---

	describe("calculateRemainingTime", () => {
		it("#11 valores positivos → tiempo correcto", () => {
			const time = calculateRemainingTime({
				bytesDownloaded: 500,
				totalBytes: 1000,
				downloadSpeed: 100,
			});

			expect(time).toBe(5); // 500 remaining / 100 speed = 5 seconds
		});

		it("#12 velocidad 0 → retorna 0", () => {
			const time = calculateRemainingTime({
				bytesDownloaded: 500,
				totalBytes: 1000,
				downloadSpeed: 0,
			});

			expect(time).toBe(0);
		});
	});

	// --- ensureDownloadId ---

	describe("ensureDownloadId", () => {
		it("#13 item con ID → mantiene ID", () => {
			const item = {
				id: "my-id",
				uri: "https://example.com/video.mp4",
				type: DownloadType.BINARY,
				title: "Test",
			};
			const result = ensureDownloadId(item);

			expect(result.id).toBe("my-id");
		});

		it("#14 item sin ID → genera desde URI", () => {
			const item = {
				id: "",
				uri: "https://example.com/video.mp4",
				type: DownloadType.BINARY,
				title: "Test",
			};
			const result = ensureDownloadId(item);

			expect(result.id).toMatch(/^download-/);
			expect(result.id.length).toBeGreaterThan(0);
		});
	});
});
