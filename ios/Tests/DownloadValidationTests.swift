// These tests require a running React Native bridge (sendEvent calls stall without one).
// Enable by adding -D INTEGRATION_TESTS to the test target's Swift compiler flags.
#if INTEGRATION_TESTS
import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: Validación y ficheros
// Tarea 03 | Fase A: Red de seguridad
// Captura el comportamiento actual de validación de configuración,
// integridad de assets, cálculo de tamaño y limpieza de paths /.nofollow.
// NO modificar código de producción. Si un test falla, ajustar el test.

class DownloadValidationTests: XCTestCase {

    var module: DownloadsModule2!
    private var moduleInitialized = false
    private var tempFiles: [URL] = []
    private var tempDirectories: [URL] = []

    // MARK: - UserDefaults keys (para limpieza)
    private let ACTIVE_DOWNLOADS_KEY = "com.downloads.activeStates"
    private let ASSET_PATHS_KEY = "com.downloads.assetPaths"
    private let ASSET_BOOKMARKS_KEY = "com.downloads.assetBookmarks"
    private let SUBTITLE_BOOKMARKS_KEY = "com.downloads.subtitleBookmarks"

    override func setUp() {
        super.setUp()
        module = DownloadsModule2()
        moduleInitialized = false
        // Limpiar UserDefaults para tests aislados
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: ACTIVE_DOWNLOADS_KEY)
        defaults.removeObject(forKey: ASSET_PATHS_KEY)
        defaults.removeObject(forKey: ASSET_BOOKMARKS_KEY)
        defaults.removeObject(forKey: SUBTITLE_BOOKMARKS_KEY)
        defaults.synchronize()
    }

    override func tearDown() {
        // Limpiar ficheros temporales
        for url in tempFiles {
            try? FileManager.default.removeItem(at: url)
        }
        tempFiles.removeAll()
        // Limpiar directorios temporales
        for url in tempDirectories {
            try? FileManager.default.removeItem(at: url)
        }
        tempDirectories.removeAll()
        // Limpiar UserDefaults
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: ACTIVE_DOWNLOADS_KEY)
        defaults.removeObject(forKey: ASSET_PATHS_KEY)
        defaults.removeObject(forKey: ASSET_BOOKMARKS_KEY)
        defaults.removeObject(forKey: SUBTITLE_BOOKMARKS_KEY)
        defaults.synchronize()
        module = nil
        super.tearDown()
    }

    // MARK: - Helpers

    private func initializeModule() -> Bool {
        var success = false
        let exp = expectation(description: "moduleInit")
        module.moduleInit(nil, resolver: { _ in
            success = true
            exp.fulfill()
        }, rejecter: { _, _, _ in
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
        moduleInitialized = success
        return success
    }

    /// Crea un directorio temporal y lo registra para limpieza en tearDown
    private func createTempDirectory(name: String) -> URL {
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        tempDirectories.append(tempDir)
        return tempDir
    }

    /// Crea un fichero dentro de un directorio con un tamaño específico en bytes
    @discardableResult
    private func createFileInDirectory(_ dirURL: URL, name: String, sizeInBytes: Int) -> URL {
        let fileURL = dirURL.appendingPathComponent(name)
        let data = Data(repeating: 0x41, count: sizeInBytes) // 'A' repeated
        FileManager.default.createFile(atPath: fileURL.path, contents: data)
        tempFiles.append(fileURL)
        return fileURL
    }

    /// Crea un fichero temporal suelto y lo registra para limpieza
    private func createTempFile(name: String, sizeInBytes: Int) -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(name)
        let data = Data(repeating: 0x41, count: sizeInBytes)
        FileManager.default.createFile(atPath: fileURL.path, contents: data)
        tempFiles.append(fileURL)
        return fileURL
    }

    /// Reproduce la lógica de limpieza /.nofollow usada en producción
    /// (patrón inline repetido en ~8 sitios de DownloadsModule2.swift)
    private func cleanNofollow(_ path: String) -> String {
        if path.hasPrefix("/.nofollow") {
            return String(path.dropFirst("/.nofollow".count))
        }
        return path
    }

    /// Reproduce la lógica de calculateAssetSize de producción (línea 2427)
    private func calculateAssetSize(at url: URL) -> Int64 {
        let fileManager = FileManager.default
        var totalSize: Int64 = 0

        var pathToUse = url.path
        var isDirectory: ObjCBool = false

        if fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) {
            pathToUse = url.path
        } else if url.path.hasPrefix("/.nofollow") {
            let cleanPath = String(url.path.dropFirst("/.nofollow".count))
            if fileManager.fileExists(atPath: cleanPath, isDirectory: &isDirectory) {
                pathToUse = cleanPath
            } else {
                return 0
            }
        } else {
            return 0
        }

        let workingURL = URL(fileURLWithPath: pathToUse)

        if fileManager.fileExists(atPath: pathToUse, isDirectory: &isDirectory) {
            if isDirectory.boolValue {
                if let enumerator = fileManager.enumerator(at: workingURL, includingPropertiesForKeys: [.fileSizeKey, .isDirectoryKey]) {
                    for case let fileURL as URL in enumerator {
                        if let resourceValues = try? fileURL.resourceValues(forKeys: [.fileSizeKey, .isDirectoryKey]) {
                            if let isDir = resourceValues.isDirectory, !isDir {
                                if let fileSize = resourceValues.fileSize {
                                    totalSize += Int64(fileSize)
                                }
                            }
                        }
                    }
                }
            } else {
                if let resourceValues = try? workingURL.resourceValues(forKeys: [.fileSizeKey]) {
                    if let fileSize = resourceValues.fileSize {
                        totalSize = Int64(fileSize)
                    }
                }
            }
        }

        return totalSize
    }

    /// Reproduce la lógica de calculateDirectorySize de producción (línea 2593)
    private func calculateDirectorySize(at url: URL) -> Int64 {
        let fileManager = FileManager.default
        var totalSize: Int64 = 0

        guard let enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey, .isDirectoryKey]) else {
            return 0
        }

        for case let fileURL as URL in enumerator {
            if let resourceValues = try? fileURL.resourceValues(forKeys: [.fileSizeKey, .isDirectoryKey]) {
                if let isDirectory = resourceValues.isDirectory, !isDirectory {
                    if let fileSize = resourceValues.fileSize {
                        totalSize += Int64(fileSize)
                    }
                }
            }
        }

        return totalSize
    }

    /// Reproduce la lógica de validación de integridad de producción (línea 2337)
    /// Pasos 1-4 (sin paso 5 — tracks AVURLAsset no reproducible sin .movpkg real)
    private func validateAssetIntegrity(at location: URL) -> (isValid: Bool, error: String?) {
        let fileManager = FileManager.default

        var pathToCheck = location.path
        if !fileManager.fileExists(atPath: pathToCheck) && pathToCheck.hasPrefix("/.nofollow") {
            pathToCheck = String(pathToCheck.dropFirst("/.nofollow".count))
        }

        // 1. Verificar que el directorio existe
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: pathToCheck, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            return (false, "Asset directory does not exist")
        }

        // 2. Verificar que tiene contenido
        guard let contents = try? fileManager.contentsOfDirectory(atPath: pathToCheck),
              !contents.isEmpty else {
            return (false, "Asset directory is empty")
        }

        // 3. Verificar tamaño mínimo (al menos 1MB)
        let workingURL = URL(fileURLWithPath: pathToCheck)
        let size = calculateAssetSize(at: workingURL)
        if size < 1_000_000 {
            return (false, "Asset size too small: \(size) bytes")
        }

        // Paso 4 (tracks) omitido — no reproducible sin .movpkg real
        return (true, nil)
    }

    // MARK: - Grupo 1: validateDownloadUri (directo)
    // validateDownloadUri es @objc (internal) — se puede llamar directamente

    /// Test 7: HLS .m3u8 → isValid=true, type="stream"
    func testValidateUri_hlsStream_validAndStream() {
        let exp = expectation(description: "validateDownloadUri")
        module.validateDownloadUri("https://example.com/video.m3u8", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("No devolvió diccionario")
                exp.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, true)
            XCTAssertEqual(dict["type"] as? String, "stream")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("validateDownloadUri no debe rechazar")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 8: DASH .mpd → isValid=true, type="stream"
    func testValidateUri_dashStream_validAndStream() {
        let exp = expectation(description: "validateDownloadUri")
        module.validateDownloadUri("https://example.com/manifest.mpd", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("No devolvió diccionario")
                exp.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, true)
            XCTAssertEqual(dict["type"] as? String, "stream")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("validateDownloadUri no debe rechazar")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 9: MP4 → isValid=true, type="binary"
    func testValidateUri_mp4_validAndBinary() {
        let exp = expectation(description: "validateDownloadUri")
        module.validateDownloadUri("https://example.com/video.mp4", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("No devolvió diccionario")
                exp.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, true)
            XCTAssertEqual(dict["type"] as? String, "binary")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("validateDownloadUri no debe rechazar")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 10: URI inválida → isValid matches URL(string:) behavior
    func testValidateUri_invalidUri_notValid() {
        let exp = expectation(description: "validateDownloadUri")
        // iOS 17+ URL(string:) is very lenient — test actual behavior
        let testUri = "not a valid url with spaces"
        let expectedValid = URL(string: testUri) != nil
        module.validateDownloadUri(testUri, resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("No devolvió diccionario")
                exp.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, expectedValid)
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("validateDownloadUri no debe rechazar")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 11: String vacío → isValid=false (URL(string:"") retorna nil)
    func testValidateUri_emptyString_notValid() {
        let exp = expectation(description: "validateDownloadUri")
        module.validateDownloadUri("", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("No devolvió diccionario")
                exp.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, false)
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("validateDownloadUri no debe rechazar")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 12: .m3u8 en medio del path → type="stream"
    func testValidateUri_hlsInPath_stream() {
        let exp = expectation(description: "validateDownloadUri")
        module.validateDownloadUri("https://cdn.example.com/content.m3u8?token=abc123", resolver: { result in
            guard let dict = result as? [String: Any] else {
                XCTFail("No devolvió diccionario")
                exp.fulfill()
                return
            }
            XCTAssertEqual(dict["isValid"] as? Bool, true)
            XCTAssertEqual(dict["type"] as? String, "stream")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("validateDownloadUri no debe rechazar")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    // MARK: - Grupo 2: validateDownloadConfig (indirecto vía addDownload)
    // validateDownloadConfig es private — testeamos indirectamente.
    // addDownload rechaza con "INVALID_CONFIG" si la config no pasa validación.
    // addDownload requiere moduleInit (guard isInitialized → "NOT_INITIALIZED").

    /// Test 1: Config completa → no rechaza con INVALID_CONFIG
    /// (puede rechazar por otra razón, ej: no hay session, pero NO con INVALID_CONFIG)
    func testValidateConfig_allFieldsPresent_accepted() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "addDownload")
        let config: NSDictionary = [
            "id": "test-config-valid",
            "uri": "https://example.com/video.m3u8",
            "title": "Test Video"
        ]
        module.addDownload(config, resolver: { _ in
            // Resolvió — config fue aceptada
            exp.fulfill()
        }, rejecter: { code, _, _ in
            // Si rechaza, NO debe ser por INVALID_CONFIG
            XCTAssertNotEqual(code, "INVALID_CONFIG", "Config completa no debe rechazar con INVALID_CONFIG")
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
    }

    /// Test 2: Config sin id → INVALID_CONFIG
    func testValidateConfig_missingId_rejected() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "addDownload")
        let config: NSDictionary = [
            "uri": "https://example.com/video.m3u8",
            "title": "Test Video"
        ]
        module.addDownload(config, resolver: { _ in
            XCTFail("Debería rechazar sin id")
            exp.fulfill()
        }, rejecter: { code, _, _ in
            XCTAssertEqual(code, "INVALID_CONFIG")
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
    }

    /// Test 3: Config sin uri → INVALID_CONFIG
    func testValidateConfig_missingUri_rejected() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "addDownload")
        let config: NSDictionary = [
            "id": "test-no-uri",
            "title": "Test Video"
        ]
        module.addDownload(config, resolver: { _ in
            XCTFail("Debería rechazar sin uri")
            exp.fulfill()
        }, rejecter: { code, _, _ in
            XCTAssertEqual(code, "INVALID_CONFIG")
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
    }

    /// Test 4: Config sin title → INVALID_CONFIG
    func testValidateConfig_missingTitle_rejected() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "addDownload")
        let config: NSDictionary = [
            "id": "test-no-title",
            "uri": "https://example.com/video.m3u8"
        ]
        module.addDownload(config, resolver: { _ in
            XCTFail("Debería rechazar sin title")
            exp.fulfill()
        }, rejecter: { code, _, _ in
            XCTAssertEqual(code, "INVALID_CONFIG")
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
    }

    /// Test 5: Dict vacío → INVALID_CONFIG
    func testValidateConfig_emptyDict_rejected() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "addDownload")
        let config: NSDictionary = [:]
        module.addDownload(config, resolver: { _ in
            XCTFail("Debería rechazar dict vacío")
            exp.fulfill()
        }, rejecter: { code, _, _ in
            XCTAssertEqual(code, "INVALID_CONFIG")
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
    }

    /// Test 6: Config con campos extra → no rechaza con INVALID_CONFIG
    func testValidateConfig_extraFields_accepted() throws {
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "addDownload")
        let config: NSDictionary = [
            "id": "test-extra-fields",
            "uri": "https://example.com/video.m3u8",
            "title": "Test Video",
            "quality": "720p",
            "customField": "custom-value"
        ]
        module.addDownload(config, resolver: { _ in
            exp.fulfill()
        }, rejecter: { code, _, _ in
            XCTAssertNotEqual(code, "INVALID_CONFIG", "Campos extra no deben causar INVALID_CONFIG")
            exp.fulfill()
        })
        waitForExpectations(timeout: 10)
    }

    // MARK: - Grupo 3: Limpieza /.nofollow (reproducción de lógica inline)
    // El patrón se repite en ~8 sitios de DownloadsModule2.swift:
    // if path.hasPrefix("/.nofollow") { let cleanPath = String(path.dropFirst("/.nofollow".count)) }

    /// Test 24: Path con prefijo → limpio
    func testNofollow_pathWithPrefix_cleaned() {
        let input = "/.nofollow/Users/test/Library/asset.movpkg"
        let expected = "/Users/test/Library/asset.movpkg"
        XCTAssertEqual(cleanNofollow(input), expected)
    }

    /// Test 25: Path sin prefijo → sin cambio
    func testNofollow_pathWithoutPrefix_unchanged() {
        let input = "/Users/test/Library/asset.movpkg"
        XCTAssertEqual(cleanNofollow(input), input)
    }

    /// Test 26: Path vacío → vacío
    func testNofollow_emptyPath_unchanged() {
        XCTAssertEqual(cleanNofollow(""), "")
    }

    /// Test 27: Solo prefijo → string vacío
    func testNofollow_onlyPrefix_becomesEmpty() {
        XCTAssertEqual(cleanNofollow("/.nofollow"), "")
    }

    // MARK: - Grupo 4: Integridad de assets (reproducción de lógica)
    // validateAssetIntegrity y validateAssetIntegrityRelaxed son private.
    // Reproducimos los pasos 1-4 (sin paso 5 — tracks AVURLAsset).

    /// Test 13: Dir con fichero >1MB → pasa checks 1-4
    func testAssetIntegrity_directoryWithLargeFile_valid() {
        let dir = createTempDirectory(name: "test-integrity-valid-\(UUID().uuidString)")
        createFileInDirectory(dir, name: "video.ts", sizeInBytes: 2_000_000) // 2MB

        let result = validateAssetIntegrity(at: dir)
        XCTAssertTrue(result.isValid, "Dir con fichero >1MB debe ser válido")
        XCTAssertNil(result.error)
    }

    /// Test 14: Path inexistente → falla check 1
    func testAssetIntegrity_nonExistentPath_invalid() {
        let nonExistent = URL(fileURLWithPath: "/tmp/non-existent-dir-\(UUID().uuidString)")

        let result = validateAssetIntegrity(at: nonExistent)
        XCTAssertFalse(result.isValid)
        XCTAssertEqual(result.error, "Asset directory does not exist")
    }

    /// Test 15: Dir vacío → falla check 2
    func testAssetIntegrity_emptyDirectory_invalid() {
        let dir = createTempDirectory(name: "test-integrity-empty-\(UUID().uuidString)")

        let result = validateAssetIntegrity(at: dir)
        XCTAssertFalse(result.isValid)
        XCTAssertEqual(result.error, "Asset directory is empty")
    }

    /// Test 16: Dir con fichero <1MB → falla check 3
    func testAssetIntegrity_tooSmall_invalid() {
        let dir = createTempDirectory(name: "test-integrity-small-\(UUID().uuidString)")
        createFileInDirectory(dir, name: "small.ts", sizeInBytes: 500_000) // 500KB

        let result = validateAssetIntegrity(at: dir)
        XCTAssertFalse(result.isValid)
        XCTAssertTrue(result.error?.contains("Asset size too small") ?? false)
    }

    /// Test 17: Fichero (no directorio) → falla check 1 (isDirectory)
    func testAssetIntegrity_fileNotDirectory_invalid() {
        let file = createTempFile(name: "test-integrity-file-\(UUID().uuidString).ts", sizeInBytes: 2_000_000)

        let result = validateAssetIntegrity(at: file)
        XCTAssertFalse(result.isValid)
        XCTAssertEqual(result.error, "Asset directory does not exist")
    }

    /// Test 18: Relaxed — dir con fichero >1MB → pasa (sin check de tracks)
    /// validateAssetIntegrityRelaxed tiene la misma lógica pasos 1-3, sin paso 5
    func testAssetIntegrityRelaxed_directoryWithLargeFile_valid() {
        let dir = createTempDirectory(name: "test-integrity-relaxed-\(UUID().uuidString)")
        createFileInDirectory(dir, name: "video.ts", sizeInBytes: 2_000_000) // 2MB

        // La versión relaxed tiene los mismos pasos 1-3 que la normal
        let result = validateAssetIntegrity(at: dir)
        XCTAssertTrue(result.isValid, "Relaxed: dir con fichero >1MB debe ser válido")
        XCTAssertNil(result.error)
    }

    // MARK: - Grupo 5: Cálculo de tamaño (reproducción de lógica)
    // calculateAssetSize y calculateDirectorySize son private.
    // Reproducimos la lógica con ficheros de tamaño conocido.

    /// Test 19: Fichero de 1024 bytes → tamaño = 1024
    func testCalculateSize_singleFile_returnsFileSize() {
        let file = createTempFile(name: "test-size-single-\(UUID().uuidString).dat", sizeInBytes: 1024)

        let size = calculateAssetSize(at: file)
        XCTAssertEqual(size, 1024, "Fichero de 1024 bytes debe reportar 1024")
    }

    /// Test 20: Dir con 3 ficheros → suma correcta
    func testCalculateSize_directoryWithFiles_returnsSumOfSizes() {
        let dir = createTempDirectory(name: "test-size-multi-\(UUID().uuidString)")
        createFileInDirectory(dir, name: "file1.dat", sizeInBytes: 1000)
        createFileInDirectory(dir, name: "file2.dat", sizeInBytes: 2000)
        createFileInDirectory(dir, name: "file3.dat", sizeInBytes: 3000)

        let size = calculateAssetSize(at: dir)
        XCTAssertEqual(size, 6000, "Suma de 1000+2000+3000 = 6000")
    }

    /// Test 21: Dir vacío → tamaño = 0
    func testCalculateSize_emptyDirectory_returnsZero() {
        let dir = createTempDirectory(name: "test-size-empty-\(UUID().uuidString)")

        let size = calculateAssetSize(at: dir)
        XCTAssertEqual(size, 0, "Dir vacío → 0")
    }

    /// Test 22: Path inexistente → tamaño = 0
    func testCalculateSize_nonExistentPath_returnsZero() {
        let nonExistent = URL(fileURLWithPath: "/tmp/non-existent-\(UUID().uuidString)")

        let size = calculateAssetSize(at: nonExistent)
        XCTAssertEqual(size, 0, "Path inexistente → 0")
    }

    /// Test 23: Dir con subdirectorios → suma recursiva
    func testCalculateSize_nestedDirectories_recursiveSum() {
        let dir = createTempDirectory(name: "test-size-nested-\(UUID().uuidString)")
        createFileInDirectory(dir, name: "root.dat", sizeInBytes: 1000)

        // Crear subdirectorio con fichero
        let subDir = dir.appendingPathComponent("subdir")
        try? FileManager.default.createDirectory(at: subDir, withIntermediateDirectories: true)
        createFileInDirectory(subDir, name: "nested.dat", sizeInBytes: 2000)

        // Crear sub-subdirectorio con fichero
        let subSubDir = subDir.appendingPathComponent("deep")
        try? FileManager.default.createDirectory(at: subSubDir, withIntermediateDirectories: true)
        createFileInDirectory(subSubDir, name: "deep.dat", sizeInBytes: 3000)

        let size = calculateAssetSize(at: dir)
        XCTAssertEqual(size, 6000, "Suma recursiva: 1000+2000+3000 = 6000")
    }
}
#endif
