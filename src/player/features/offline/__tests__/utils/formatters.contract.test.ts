import {
	formatDownloadSpeed,
	formatRemainingTime,
	formatFileSize,
	formatPercentage,
	formatDownloadProgress,
	formatDuration,
} from "../../utils/formatters";

describe("formatters — Contrato público", () => {
	// --- formatDownloadSpeed ---

	describe("formatDownloadSpeed", () => {
		it("#1 bytes range → B/s", () => {
			const result = formatDownloadSpeed(500);

			expect(result).toContain("B/s");
		});

		it("#2 KB range", () => {
			const result = formatDownloadSpeed(1500);

			expect(result).toContain("KB/s");
		});

		it("#3 MB range", () => {
			const result = formatDownloadSpeed(11408755);

			expect(result).toContain("MB/s");
		});

		it("#4 0 → '0 B/s'", () => {
			expect(formatDownloadSpeed(0)).toBe("0 B/s");
		});

		it("#5 negativo → 'N/A'", () => {
			expect(formatDownloadSpeed(-100)).toBe("N/A");
		});
	});

	// --- formatRemainingTime ---

	describe("formatRemainingTime", () => {
		it("#6 seconds only", () => {
			const result = formatRemainingTime(45);

			expect(result).toContain("45s");
		});

		it("#7 minutes + seconds", () => {
			const result = formatRemainingTime(431);

			expect(result).toContain("7m");
			expect(result).toContain("11s");
		});

		it("#8 hours + minutes + seconds", () => {
			const result = formatRemainingTime(7265);

			expect(result).toContain("2h");
			expect(result).toContain("1m");
			expect(result).toContain("5s");
		});

		it("#9 0 → 'N/A'", () => {
			expect(formatRemainingTime(0)).toBe("N/A");
		});
	});

	// --- formatFileSize ---

	describe("formatFileSize", () => {
		it("#10 various magnitudes (decimal)", () => {
			expect(formatFileSize(500)).toContain("B");
			expect(formatFileSize(1500)).toContain("KB");
			expect(formatFileSize(1500000)).toContain("MB");
			expect(formatFileSize(5000000000)).toContain("GB");
		});

		it("#11 0 → '0 B'", () => {
			expect(formatFileSize(0)).toBe("0 B");
		});
	});

	// --- formatPercentage ---

	describe("formatPercentage", () => {
		it("#12 normal value", () => {
			const result = formatPercentage(91.108);

			expect(result).toBe("91.1%");
		});

		it("#13 boundaries 0 and 100", () => {
			expect(formatPercentage(0)).toBe("0.0%");
			expect(formatPercentage(100)).toBe("100.0%");
		});
	});

	// --- formatDownloadProgress ---

	describe("formatDownloadProgress", () => {
		it("#14 returns complete object with all fields", () => {
			const result = formatDownloadProgress(142050413, 5063702600, 11408755, 431);

			expect(result).toHaveProperty("downloaded");
			expect(result).toHaveProperty("total");
			expect(result).toHaveProperty("percentage");
			expect(result).toHaveProperty("speed");
			expect(result).toHaveProperty("remainingTime");
			expect(result).toHaveProperty("ratio");
			expect(result.ratio).toContain("/");
		});
	});

	// --- formatDuration ---

	describe("formatDuration", () => {
		it("#15 milliseconds → formatted time", () => {
			const result = formatDuration(330000); // 5m 30s

			expect(result).toContain("5m");
			expect(result).toContain("30s");
		});
	});
});
