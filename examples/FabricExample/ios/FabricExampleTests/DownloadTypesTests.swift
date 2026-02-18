import XCTest
@testable import react_native_video

// MARK: - Tests: DownloadTypes extraídos
// Tarea 05 | Fase B: Extracciones de bajo riesgo
// Valida que los tipos extraídos a DownloadTypes.swift mantienen
// los valores correctos (DownloadConstants, DownloadQuality).
// Los tests de DownloadState y DownloadInfo ya existen en Fase A.

class DownloadTypesTests: XCTestCase {

    // MARK: - DownloadState (complementario a DownloadStateTests)

    func testDownloadState_allCases_has13Elements() {
        XCTAssertEqual(DownloadState.allCases.count, 13, "DownloadState debe tener 13 casos")
    }

    // MARK: - DownloadQuality

    func testDownloadQuality_low_bitrate() {
        XCTAssertEqual(DownloadQuality.low.minBitrate, 500_000)
    }

    func testDownloadQuality_medium_bitrate() {
        XCTAssertEqual(DownloadQuality.medium.minBitrate, 1_500_000)
    }

    func testDownloadQuality_high_bitrate() {
        XCTAssertEqual(DownloadQuality.high.minBitrate, 3_000_000)
    }

    func testDownloadQuality_auto_bitrate() {
        XCTAssertEqual(DownloadQuality.auto.minBitrate, 0)
    }

    func testDownloadQuality_rawValues() {
        XCTAssertEqual(DownloadQuality.low.rawValue, "low")
        XCTAssertEqual(DownloadQuality.medium.rawValue, "medium")
        XCTAssertEqual(DownloadQuality.high.rawValue, "high")
        XCTAssertEqual(DownloadQuality.auto.rawValue, "auto")
    }

    // MARK: - DownloadConstants — UserDefaults keys

    func testDownloadConstants_activeDownloadsKey_notEmpty() {
        XCTAssertFalse(DownloadConstants.ACTIVE_DOWNLOADS_KEY.isEmpty)
    }

    func testDownloadConstants_assetPathsKey_notEmpty() {
        XCTAssertFalse(DownloadConstants.ASSET_PATHS_KEY.isEmpty)
    }

    func testDownloadConstants_assetBookmarksKey_notEmpty() {
        XCTAssertFalse(DownloadConstants.ASSET_BOOKMARKS_KEY.isEmpty)
    }

    func testDownloadConstants_subtitleBookmarksKey_notEmpty() {
        XCTAssertFalse(DownloadConstants.SUBTITLE_BOOKMARKS_KEY.isEmpty)
    }

    func testDownloadConstants_keysMatchExpectedValues() {
        XCTAssertEqual(DownloadConstants.ACTIVE_DOWNLOADS_KEY, "com.downloads.activeStates")
        XCTAssertEqual(DownloadConstants.ASSET_PATHS_KEY, "com.downloads.assetPaths")
        XCTAssertEqual(DownloadConstants.ASSET_BOOKMARKS_KEY, "com.downloads.assetBookmarks")
        XCTAssertEqual(DownloadConstants.SUBTITLE_BOOKMARKS_KEY, "com.downloads.subtitleBookmarks")
    }

    // MARK: - DownloadConstants — Thresholds

    func testDownloadConstants_progressThreshold() {
        XCTAssertEqual(DownloadConstants.PROGRESS_THRESHOLD, 0.98, accuracy: 0.001)
    }

    func testDownloadConstants_minAssetSize() {
        XCTAssertEqual(DownloadConstants.MIN_ASSET_SIZE, 1_000_000)
    }

    func testDownloadConstants_defaultEstimatedSize() {
        XCTAssertEqual(DownloadConstants.DEFAULT_ESTIMATED_SIZE, 500_000_000)
    }

    func testDownloadConstants_cacheTTL() {
        XCTAssertEqual(DownloadConstants.DOWNLOAD_SPACE_CACHE_TTL, 5.0, accuracy: 0.001)
    }
}
