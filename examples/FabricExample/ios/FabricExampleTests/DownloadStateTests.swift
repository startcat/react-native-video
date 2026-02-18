import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: DownloadState enum
// Tarea 04 | Fase A: Red de seguridad
// Captura el comportamiento actual del enum DownloadState
// (stringValue, unicidad, allCases, rawValues).
// NO modificar código de producción. Si un test falla, ajustar el test.

class DownloadStateTests: XCTestCase {

    // MARK: - Test 9: Todos los stringValue son no vacíos
    func testStringValue_allCases_nonEmpty() {
        for state in DownloadState.allCases {
            XCTAssertFalse(state.stringValue.isEmpty, "\(state) tiene stringValue vacío")
        }
    }

    // MARK: - Test 10: Todos los stringValue son únicos
    func testStringValue_allCases_unique() {
        let allValues = DownloadState.allCases.map { $0.stringValue }
        let uniqueValues = Set(allValues)
        XCTAssertEqual(allValues.count, uniqueValues.count, "Hay stringValues duplicados")
    }

    // MARK: - Test 11: Valores específicos conocidos
    func testStringValue_specificValues() {
        XCTAssertEqual(DownloadState.notDownloaded.stringValue, "NOT_DOWNLOADED")
        XCTAssertEqual(DownloadState.preparing.stringValue, "PREPARING")
        XCTAssertEqual(DownloadState.queued.stringValue, "QUEUED")
        XCTAssertEqual(DownloadState.downloading.stringValue, "DOWNLOADING")
        XCTAssertEqual(DownloadState.paused.stringValue, "PAUSED")
        XCTAssertEqual(DownloadState.completed.stringValue, "COMPLETED")
        XCTAssertEqual(DownloadState.failed.stringValue, "FAILED")
        XCTAssertEqual(DownloadState.removing.stringValue, "REMOVING")
        XCTAssertEqual(DownloadState.stopped.stringValue, "STOPPED")
        XCTAssertEqual(DownloadState.waitingForNetwork.stringValue, "WAITING_FOR_NETWORK")
        XCTAssertEqual(DownloadState.licenseExpired.stringValue, "LICENSE_EXPIRED")
        XCTAssertEqual(DownloadState.drmExpired.stringValue, "DRM_EXPIRED")
        XCTAssertEqual(DownloadState.restarting.stringValue, "RESTARTING")
    }

    // MARK: - Test 12: 13 casos totales
    func testAllCases_count() {
        XCTAssertEqual(DownloadState.allCases.count, 13, "DownloadState debe tener 13 casos")
    }

    // MARK: - Test 13: Raw values secuenciales 0-12
    func testRawValues_sequential() {
        for (index, state) in DownloadState.allCases.enumerated() {
            XCTAssertEqual(state.rawValue, index, "\(state) debe tener rawValue \(index)")
        }
    }
}
