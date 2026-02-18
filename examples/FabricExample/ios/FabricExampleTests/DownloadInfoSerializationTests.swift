import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: DownloadInfo serialización
// Tarea 04 | Fase A: Red de seguridad
// Captura el comportamiento actual de createDownloadInfoDict (private).
// Reproducimos la lógica de producción (DownloadsModule2.swift:1958).
// NO modificar código de producción. Si un test falla, ajustar el test.

class DownloadInfoSerializationTests: XCTestCase {

    // MARK: - Helper

    /// Reproduce la lógica de createDownloadInfoDict de producción (línea 1958)
    private func createDownloadInfoDict(from downloadInfo: DownloadInfo) -> [String: Any] {
        return [
            "id": downloadInfo.id,
            "uri": downloadInfo.uri,
            "title": downloadInfo.title,
            "state": downloadInfo.state.stringValue,
            "progress": Int(downloadInfo.progress * 100),
            "totalBytes": downloadInfo.totalBytes,
            "downloadedBytes": downloadInfo.downloadedBytes,
            "speed": downloadInfo.speed,
            "remainingTime": downloadInfo.remainingTime,
            "quality": downloadInfo.quality ?? "",
            "hasSubtitles": downloadInfo.hasSubtitles,
            "hasDRM": downloadInfo.hasDRM
        ]
    }

    /// Helper para crear DownloadInfo con valores por defecto
    private func makeDownloadInfo(
        id: String = "test-id",
        uri: String = "https://example.com/video.m3u8",
        title: String = "Test Video",
        state: DownloadState = .completed,
        progress: Float = 1.0,
        totalBytes: Int64 = 1024000,
        downloadedBytes: Int64 = 1024000,
        speed: Double = 0.0,
        remainingTime: Int = 0,
        quality: String? = "720p",
        hasSubtitles: Bool = false,
        hasDRM: Bool = false
    ) -> DownloadInfo {
        return DownloadInfo(
            id: id,
            uri: uri,
            title: title,
            state: state,
            progress: progress,
            totalBytes: totalBytes,
            downloadedBytes: downloadedBytes,
            speed: speed,
            remainingTime: remainingTime,
            quality: quality,
            hasSubtitles: hasSubtitles,
            hasDRM: hasDRM,
            error: nil,
            startTime: Date(),
            assetPath: nil
        )
    }

    // MARK: - Tests

    /// Test 29: Completed, progress 1.0 → progress=100
    func testCreateDict_completed_progress100() {
        let info = makeDownloadInfo(state: .completed, progress: 1.0)
        let dict = createDownloadInfoDict(from: info)
        XCTAssertEqual(dict["progress"] as? Int, 100)
        XCTAssertEqual(dict["state"] as? String, "COMPLETED")
    }

    /// Test 30: Downloading, progress 0.45 → progress=45
    func testCreateDict_downloading_progress45() {
        let info = makeDownloadInfo(state: .downloading, progress: 0.45)
        let dict = createDownloadInfoDict(from: info)
        XCTAssertEqual(dict["progress"] as? Int, 45)
        XCTAssertEqual(dict["state"] as? String, "DOWNLOADING")
    }

    /// Test 31: Verificar todos los campos del dict
    func testCreateDict_allFieldsMapped() {
        let info = makeDownloadInfo(
            id: "dl-001",
            uri: "https://cdn.example.com/video.m3u8",
            title: "My Video",
            state: .paused,
            progress: 0.75,
            totalBytes: 2048000,
            downloadedBytes: 1536000,
            speed: 512.5,
            remainingTime: 120,
            quality: "1080p",
            hasSubtitles: true,
            hasDRM: true
        )
        let dict = createDownloadInfoDict(from: info)

        XCTAssertEqual(dict["id"] as? String, "dl-001")
        XCTAssertEqual(dict["uri"] as? String, "https://cdn.example.com/video.m3u8")
        XCTAssertEqual(dict["title"] as? String, "My Video")
        XCTAssertEqual(dict["state"] as? String, "PAUSED")
        XCTAssertEqual(dict["progress"] as? Int, 75)
        XCTAssertEqual(dict["totalBytes"] as? Int64, 2048000)
        XCTAssertEqual(dict["downloadedBytes"] as? Int64, 1536000)
        XCTAssertEqual(dict["speed"] as? Double, 512.5)
        XCTAssertEqual(dict["remainingTime"] as? Int, 120)
        XCTAssertEqual(dict["quality"] as? String, "1080p")
        XCTAssertEqual(dict["hasSubtitles"] as? Bool, true)
        XCTAssertEqual(dict["hasDRM"] as? Bool, true)
    }

    /// Test 32: quality=nil → ""
    func testCreateDict_qualityNil_emptyString() {
        let info = makeDownloadInfo(quality: nil)
        let dict = createDownloadInfoDict(from: info)
        XCTAssertEqual(dict["quality"] as? String, "", "quality nil debe mapearse a string vacío")
    }

    /// Test 33: Crear DownloadInfo → campos correctos
    func testDownloadInfo_structCreation() {
        let info = makeDownloadInfo(
            id: "struct-test",
            uri: "https://example.com/test.m3u8",
            title: "Struct Test",
            state: .queued,
            progress: 0.0,
            totalBytes: 0,
            downloadedBytes: 0,
            quality: nil,
            hasSubtitles: true,
            hasDRM: false
        )

        XCTAssertEqual(info.id, "struct-test")
        XCTAssertEqual(info.uri, "https://example.com/test.m3u8")
        XCTAssertEqual(info.title, "Struct Test")
        XCTAssertEqual(info.state, .queued)
        XCTAssertEqual(info.progress, 0.0)
        XCTAssertEqual(info.totalBytes, 0)
        XCTAssertEqual(info.downloadedBytes, 0)
        XCTAssertNil(info.quality)
        XCTAssertEqual(info.hasSubtitles, true)
        XCTAssertEqual(info.hasDRM, false)
        XCTAssertNil(info.error)
    }
}
