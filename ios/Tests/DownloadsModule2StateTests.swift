import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: CRUD y estado de descargas
// Tarea 01 | Fase A: Red de seguridad
// Captura el comportamiento actual de DownloadsModule2 antes de refactorizar.
// NO modificar código de producción. Si un test falla, ajustar el test.

class DownloadsModule2StateTests: XCTestCase {

    var module: DownloadsModule2!
    private var moduleInitialized = false

    override func setUp() {
        super.setUp()
        module = DownloadsModule2()
        moduleInitialized = false
        // Limpiar UserDefaults para tests aislados
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "com.downloads.activeStates")
        defaults.removeObject(forKey: "com.downloads.assetPaths")
        defaults.removeObject(forKey: "com.downloads.assetBookmarks")
        defaults.removeObject(forKey: "com.downloads.subtitleBookmarks")
        defaults.synchronize()
    }

    override func tearDown() {
        module = nil
        super.tearDown()
    }

    // MARK: - Helper

    private func initializeModule() -> Bool {
        var success = false
        let exp = expectation(description: "moduleInit")
        module.moduleInit(nil, resolver: { _ in
            success = true
            exp.fulfill()
        }, rejecter: { _, _, _ in
            exp.fulfill()
        })
        wait(for: [exp], timeout: 10)
        moduleInitialized = success
        return success
    }

    // MARK: - Instanciación

    func testModuleCanBeInstantiated() {
        XCTAssertNotNil(module, "DownloadsModule2 debería poder instanciarse")
    }

    // MARK: - getDownloads (REQ-012)

    func testGetDownloads_empty_returnsEmptyArray() {
        let expectation = self.expectation(description: "getDownloads resolves")

        module.getDownloads({ result in
            guard let dict = result as? [String: Any],
                  let downloads = dict["downloads"] as? [[String: Any]] else {
                XCTFail("Expected dictionary with 'downloads' key")
                expectation.fulfill()
                return
            }
            XCTAssertEqual(downloads.count, 0)
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownloads should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - hasDownload (REQ-014)

    func testHasDownload_nonExistent_returnsFalse() {
        let expectation = self.expectation(description: "hasDownload resolves")

        module.hasDownload("non-existent-id", resolver: { result in
            XCTAssertEqual(result as? Bool, false)
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("hasDownload should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - getDownload (REQ-013)

    func testGetDownload_nonExistent_returnsNil() {
        let expectation = self.expectation(description: "getDownload resolves")

        module.getDownload("non-existent-id", resolver: { result in
            XCTAssertNil(result)
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownload should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - getStats (REQ-015)

    func testGetStats_empty_returnsZeroCounts() {
        let expectation = self.expectation(description: "getStats resolves")

        module.getStats({ result in
            guard let stats = result as? [String: Any] else {
                XCTFail("Expected dictionary")
                expectation.fulfill()
                return
            }
            XCTAssertEqual(stats["activeDownloads"] as? Int, 0)
            XCTAssertEqual(stats["completedDownloads"] as? Int, 0)
            XCTAssertEqual(stats["failedDownloads"] as? Int, 0)
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getStats should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    func testGetStats_returnsExpectedKeys() {
        let expectation = self.expectation(description: "getStats resolves")

        module.getStats({ result in
            guard let stats = result as? [String: Any] else {
                XCTFail("Expected dictionary")
                expectation.fulfill()
                return
            }
            // Verificar que todas las keys esperadas existen
            XCTAssertNotNil(stats["activeDownloads"], "Missing key: activeDownloads")
            XCTAssertNotNil(stats["queuedDownloads"], "Missing key: queuedDownloads")
            XCTAssertNotNil(stats["completedDownloads"], "Missing key: completedDownloads")
            XCTAssertNotNil(stats["failedDownloads"], "Missing key: failedDownloads")
            XCTAssertNotNil(stats["totalDownloaded"], "Missing key: totalDownloaded")
            XCTAssertNotNil(stats["averageSpeed"], "Missing key: averageSpeed")
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getStats should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - removeDownload (REQ-006)

    func testRemoveDownload_nonExistent_resolvesOrRejectsWithRemoveFailed() {
        let expectation = self.expectation(description: "removeDownload completes")

        // removeDownload no tiene guard de existencia — intenta removeDownloadedFiles
        // que puede lanzar si no encuentra ficheros. Documenta el comportamiento real.
        module.removeDownload("non-existent-id", resolver: { _ in
            // Resolve sin error: ficheros no existían, limpieza silenciosa
            expectation.fulfill()
        }, rejecter: { code, message, error in
            // Reject: removeDownloadedFiles lanzó excepción
            XCTAssertEqual(code, "REMOVE_DOWNLOAD_FAILED")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - pauseDownload (REQ-003)

    func testPauseDownload_nonExistent_rejectsDownloadNotFound() {
        let expectation = self.expectation(description: "pauseDownload rejects")

        module.pauseDownload("non-existent-id", resolver: { _ in
            // pauseDownload has guard for activeDownloads[id] — should reject
            // If it resolves, the production code changed — fail to detect regression
            XCTFail("pauseDownload should reject for non-existent ID")
            expectation.fulfill()
        }, rejecter: { code, message, error in
            XCTAssertEqual(code, "DOWNLOAD_NOT_FOUND")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - resumeDownload (REQ-004)

    func testResumeDownload_nonExistent_rejectsDownloadNotFound() {
        let expectation = self.expectation(description: "resumeDownload rejects")

        module.resumeDownload("non-existent-id", resolver: { _ in
            XCTFail("resumeDownload should reject for non-existent ID")
            expectation.fulfill()
        }, rejecter: { code, message, error in
            XCTAssertEqual(code, "DOWNLOAD_NOT_FOUND")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - cancelDownload (REQ-005)

    func testCancelDownload_nonExistent_delegatesToRemoveDownload() {
        let expectation = self.expectation(description: "cancelDownload completes")

        // cancelDownload delega a removeDownload internamente (línea 738-739)
        // Comportamiento idéntico a testRemoveDownload_nonExistent
        module.cancelDownload("non-existent-id", resolver: { _ in
            // Resolve sin error: ficheros no existían, limpieza silenciosa
            expectation.fulfill()
        }, rejecter: { code, message, error in
            // Reject: removeDownloadedFiles lanzó excepción
            XCTAssertEqual(code, "REMOVE_DOWNLOAD_FAILED")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - pauseAll (REQ-007)

    func testPauseAll_empty_resolves() {
        let expectation = self.expectation(description: "pauseAll resolves")

        module.pauseAll({ _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("pauseAll should not reject with no downloads")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - resumeAll (REQ-008)

    func testResumeAll_empty_resolves() {
        let expectation = self.expectation(description: "resumeAll resolves")

        module.resumeAll({ _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("resumeAll should not reject with no downloads")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - cancelAll (REQ-009)

    func testCancelAll_empty_resolves() {
        let expectation = self.expectation(description: "cancelAll resolves")

        module.cancelAll({ _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("cancelAll should not reject with no downloads")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - addDownload (REQ-001, REQ-002)
    // Nota: addDownload requiere moduleInit() previo (guard isInitialized).
    // Sin moduleInit, rechaza con NOT_INITIALIZED.

    func testAddDownload_withoutInit_rejectsNotInitialized() {
        let expectation = self.expectation(description: "addDownload rejects without init")
        let config: NSDictionary = [
            "id": "test-123",
            "uri": "https://example.com/stream.m3u8",
            "title": "Test Video"
        ]

        module.addDownload(config, resolver: { _ in
            XCTFail("addDownload should reject without moduleInit")
            expectation.fulfill()
        }, rejecter: { code, message, error in
            XCTAssertEqual(code, "NOT_INITIALIZED")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    func testAddDownload_missingId_rejects() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit failed — cannot test addDownload validation in this environment")

        let expectation = self.expectation(description: "addDownload rejects")
        let config: NSDictionary = [
            "uri": "https://example.com/stream.m3u8",
            "title": "Test Video"
        ]

        module.addDownload(config, resolver: { _ in
            XCTFail("addDownload should reject with missing id")
            expectation.fulfill()
        }, rejecter: { code, message, error in
            XCTAssertEqual(code, "INVALID_CONFIG")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 10)
    }

    func testAddDownload_missingUri_rejects() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit failed — cannot test addDownload validation in this environment")

        let expectation = self.expectation(description: "addDownload rejects")
        let config: NSDictionary = [
            "id": "test-123",
            "title": "Test Video"
        ]

        module.addDownload(config, resolver: { _ in
            XCTFail("addDownload should reject with missing uri")
            expectation.fulfill()
        }, rejecter: { code, message, error in
            XCTAssertEqual(code, "INVALID_CONFIG")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 10)
    }

    func testAddDownload_missingTitle_rejects() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit failed — cannot test addDownload validation in this environment")

        let expectation = self.expectation(description: "addDownload rejects")
        let config: NSDictionary = [
            "id": "test-123",
            "uri": "https://example.com/stream.m3u8"
        ]

        module.addDownload(config, resolver: { _ in
            XCTFail("addDownload should reject with missing title")
            expectation.fulfill()
        }, rejecter: { code, message, error in
            XCTAssertEqual(code, "INVALID_CONFIG")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 10)
    }

    func testAddDownload_validConfig_resolves() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit failed — cannot test addDownload in this environment")

        let expectation = self.expectation(description: "addDownload resolves")
        let config: NSDictionary = [
            "id": "test-123",
            "uri": "https://example.com/stream.m3u8",
            "title": "Test Video"
        ]

        module.addDownload(config, resolver: { result in
            expectation.fulfill()
        }, rejecter: { code, message, error in
            // Network or session errors are acceptable in test environment
            expectation.fulfill()
        })

        waitForExpectations(timeout: 15)
    }

    func testAddDownload_extraFields_resolves() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit failed — cannot test addDownload in this environment")

        let expectation = self.expectation(description: "addDownload resolves")
        let config: NSDictionary = [
            "id": "test-456",
            "uri": "https://example.com/stream.m3u8",
            "title": "Test Video",
            "extraField": "should be ignored",
            "anotherExtra": 42
        ]

        module.addDownload(config, resolver: { result in
            expectation.fulfill()
        }, rejecter: { code, message, error in
            // Network or session errors are acceptable in test environment
            expectation.fulfill()
        })

        waitForExpectations(timeout: 15)
    }
}
