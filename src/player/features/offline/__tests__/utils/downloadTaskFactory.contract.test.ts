import {
	createDownloadTask,
	extractSubtitlesFromManifest,
	sortDownloads,
} from "../../utils/downloadTaskFactory";
import {
	BinaryDownloadTask,
	DownloadItem,
	DownloadStates,
	DownloadType,
	StreamDownloadTask,
	SubtitleFormat,
} from "../../types";

// Mock manifest parsers (they do HTTP fetches)
jest.mock("../../services/manifest/HLSManifestParser", () => ({
	hlsManifestParser: {
		extractSubtitles: jest.fn().mockResolvedValue([
			{
				id: "sub-es",
				uri: "https://cdn.example.com/subs/es.vtt",
				language: "es",
				label: "Español",
				format: "vtt",
				isDefault: true,
			},
		]),
	},
}));

jest.mock("../../services/manifest/DASHManifestParser", () => ({
	dashManifestParser: {
		extractSubtitles: jest.fn().mockResolvedValue([
			{
				id: "sub-en",
				uri: "https://cdn.example.com/subs/en.ttml",
				language: "en",
				label: "English",
				format: "ttml",
				isDefault: false,
			},
		]),
	},
}));

describe("downloadTaskFactory — Contrato público", () => {
	// --- createDownloadTask ---

	describe("createDownloadTask", () => {
		it("#1 stream HLS → task con config HLS", async () => {
			const result = await createDownloadTask({
				item: {
					id: "stream-1",
					uri: "https://cdn.example.com/video.m3u8",
					type: DownloadType.STREAM,
					title: "HLS Video",
				},
				binariesDir: "/data/binaries",
			});

			const task = result.task as StreamDownloadTask;
			expect(task.id).toBe("stream-1");
			expect(task.manifestUrl).toBe("https://cdn.example.com/video.m3u8");
			expect(task.config.type).toBe("HLS");
			expect(task.title).toBe("HLS Video");
		});

		it("#2 stream DASH → task con config DASH", async () => {
			const result = await createDownloadTask({
				item: {
					id: "stream-2",
					uri: "https://cdn.example.com/video.mpd",
					type: DownloadType.STREAM,
					title: "DASH Video",
				},
				binariesDir: "/data/binaries",
			});

			const task = result.task as StreamDownloadTask;
			expect(task.id).toBe("stream-2");
			expect(task.config.type).toBe("DASH");
		});

		it("#3 binario → task binaria con destination", async () => {
			const result = await createDownloadTask({
				item: {
					id: "bin-1",
					uri: "https://cdn.example.com/file.mp4",
					type: DownloadType.BINARY,
					title: "Binary File",
				},
				binariesDir: "/data/binaries",
			});

			const task = result.task as BinaryDownloadTask;
			expect(task.id).toBe("bin-1");
			expect(task.url).toBe("https://cdn.example.com/file.mp4");
			expect(task.destination).toBe("/data/binaries/bin-1");
			expect(task.resumable).toBe(true);
			expect(result.extractedSubtitles).toEqual([]);
		});

		it("#4 stream con subtítulos proporcionados → usa los proporcionados", async () => {
			const result = await createDownloadTask({
				item: {
					id: "stream-3",
					uri: "https://cdn.example.com/video.m3u8",
					type: DownloadType.STREAM,
					title: "Video con subs",
					subtitles: [
						{
							id: "sub-custom",
							uri: "https://cdn.example.com/custom.vtt",
							language: "fr",
							label: "Français",
							format: SubtitleFormat.VTT,
							isDefault: false,
						},
					],
				},
				binariesDir: "/data/binaries",
			});

			const task = result.task as StreamDownloadTask;
			expect(task.subtitles).toHaveLength(1);
			expect(task.subtitles![0].language).toBe("fr");
			expect(task.subtitles![0].uri).toBe("https://cdn.example.com/custom.vtt");
		});

		it("#5 stream sin subtítulos → extrae del manifest HLS", async () => {
			const result = await createDownloadTask({
				item: {
					id: "stream-4",
					uri: "https://cdn.example.com/video.m3u8",
					type: DownloadType.STREAM,
					title: "Video sin subs",
				},
				binariesDir: "/data/binaries",
			});

			const task = result.task as StreamDownloadTask;
			expect(task.subtitles).toBeDefined();
			expect(task.subtitles!.length).toBeGreaterThan(0);
			expect(result.extractedSubtitles.length).toBeGreaterThan(0);
		});

		it("#6 tipo inválido → error", async () => {
			await expect(
				createDownloadTask({
					item: {
						id: "invalid-1",
						uri: "https://cdn.example.com/file",
						type: "INVALID" as DownloadType,
						title: "Invalid",
					},
					binariesDir: "/data/binaries",
				})
			).rejects.toThrow();
		});
	});

	// --- sortDownloads ---

	describe("sortDownloads", () => {
		const makeItem = (id: string, state: DownloadStates, startedAt?: number): DownloadItem =>
			({
				id,
				type: DownloadType.STREAM,
				title: id,
				uri: `https://example.com/${id}`,
				profileIds: [],
				state,
				stats: {
					progressPercent: 0,
					bytesDownloaded: 0,
					totalBytes: 0,
					retryCount: 0,
					startedAt,
				},
			}) as DownloadItem;

		it("#7 ordena por prioridad de estado", () => {
			const items = [
				makeItem("completed", DownloadStates.COMPLETED),
				makeItem("downloading", DownloadStates.DOWNLOADING),
				makeItem("failed", DownloadStates.FAILED),
				makeItem("queued", DownloadStates.QUEUED),
			];

			const sorted = sortDownloads(items);

			expect(sorted[0].id).toBe("downloading");
			expect(sorted[1].id).toBe("queued");
			expect(sorted[2].id).toBe("failed");
			expect(sorted[3].id).toBe("completed");
		});

		it("#8 array vacío → array vacío", () => {
			expect(sortDownloads([])).toEqual([]);
		});
	});

	// --- extractSubtitlesFromManifest ---

	describe("extractSubtitlesFromManifest", () => {
		it("#9 HLS manifest → subtítulos extraídos", async () => {
			const subs = await extractSubtitlesFromManifest("https://cdn.example.com/video.m3u8");

			expect(subs.length).toBeGreaterThan(0);
			expect(subs[0].language).toBe("es");
		});

		it("#10 DASH manifest → subtítulos extraídos", async () => {
			const subs = await extractSubtitlesFromManifest("https://cdn.example.com/video.mpd");

			expect(subs.length).toBeGreaterThan(0);
			expect(subs[0].language).toBe("en");
		});

		it("#11 URI sin extensión reconocida → array vacío", async () => {
			const subs = await extractSubtitlesFromManifest("https://cdn.example.com/video.mp4");

			expect(subs).toEqual([]);
		});
	});
});
