import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: Configuración y validación URI
// Tarea 01 | Fase A: Red de seguridad
// Captura el comportamiento actual de los métodos de configuración de DownloadsModule2.
// NO modificar código de producción. Si un test falla, ajustar el test.

class DownloadsModule2ConfigTests: XCTestCase {

    var module: DownloadsModule2!

    override func setUp() {
        super.setUp()
        module = DownloadsModule2()
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

    // MARK: - setStreamQuality (REQ-011)

    func testSetStreamQuality_validQuality_resolves() {
        let expectation = self.expectation(description: "setStreamQuality resolves")

        module.setStreamQuality("high", resolver: { _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    func testSetStreamQuality_allValues_resolve() {
        let qualities = ["low", "medium", "high", "auto"]

        for quality in qualities {
            let expectation = self.expectation(description: "setStreamQuality resolves for \(quality)")

            module.setStreamQuality(quality, resolver: { _ in
                expectation.fulfill()
            }, rejecter: { _, _, _ in
                XCTFail("Should not reject for quality: \(quality)")
                expectation.fulfill()
            })
        }

        waitForExpectations(timeout: 5)
    }

    // MARK: - setNetworkPolicy

    func testSetNetworkPolicy_validConfig_resolves() {
        let expectation = self.expectation(description: "setNetworkPolicy resolves")
        let config: NSDictionary = [
            "allowCellular": false,
            "requireWifi": true
        ]

        module.setNetworkPolicy(config, resolver: { _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - setDownloadLimits

    func testSetDownloadLimits_validConfig_resolves() {
        let expectation = self.expectation(description: "setDownloadLimits resolves")
        let config: NSDictionary = ["maxConcurrent": 3]

        module.setDownloadLimits(config, resolver: { _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    // MARK: - validateDownloadUri (REQ-002)

    func testValidateDownloadUri_validHLS_returnsStreamType() {
        let expectation = self.expectation(description: "validateDownloadUri resolves")

        module.validateDownloadUri("https://example.com/video.m3u8", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("Expected dictionary")
                expectation.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, true)
            XCTAssertEqual(dict["type"] as? String, "stream")
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    func testValidateDownloadUri_validMP4_returnsBinaryType() {
        let expectation = self.expectation(description: "validateDownloadUri resolves")

        module.validateDownloadUri("https://example.com/video.mp4", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("Expected dictionary")
                expectation.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, true)
            XCTAssertEqual(dict["type"] as? String, "binary")
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    func testValidateDownloadUri_invalidUri_returnsInvalid() {
        let expectation = self.expectation(description: "validateDownloadUri resolves")

        module.validateDownloadUri("not a valid url with spaces", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("Expected dictionary")
                expectation.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, false)
            // Invalid URIs default to "binary" because they don't contain .m3u8/.mpd
            XCTAssertEqual(dict["type"] as? String, "binary")
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }

    func testValidateDownloadUri_emptyString_returnsInvalid() {
        let expectation = self.expectation(description: "validateDownloadUri resolves")

        module.validateDownloadUri("", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("Expected dictionary")
                expectation.fulfill()
                return
            }
            // URL(string: "") returns nil in iOS, so isValid = false
            XCTAssertEqual(dict["isValid"] as? Bool, false)
            // Empty string defaults to "binary" (no .m3u8/.mpd match)
            XCTAssertEqual(dict["type"] as? String, "binary")
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Should not reject")
            expectation.fulfill()
        })

        waitForExpectations(timeout: 5)
    }
}
