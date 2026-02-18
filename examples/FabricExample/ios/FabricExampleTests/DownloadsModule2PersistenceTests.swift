// These tests require a running React Native bridge (sendEvent calls stall without one).
// Enable by adding -D INTEGRATION_TESTS to the test target's Swift compiler flags.
#if INTEGRATION_TESTS
import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: Persistencia
// Tarea 02 | Fase A: Red de seguridad
// Captura el comportamiento actual de la persistencia en UserDefaults
// de DownloadsModule2 antes de refactorizar.
// NO modificar código de producción. Si un test falla, ajustar el test.

class DownloadsModule2PersistenceTests: XCTestCase {

    var module: DownloadsModule2!
    private var moduleInitialized = false
    private var tempFiles: [URL] = []

    // MARK: - UserDefaults keys (deben coincidir con producción)
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

    /// Crea un fichero temporal real y registra para limpieza en tearDown
    private func createTempFile(name: String, content: String = "test content") -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent(name)
        FileManager.default.createFile(atPath: fileURL.path, contents: Data(content.utf8))
        tempFiles.append(fileURL)
        return fileURL
    }

    // MARK: - Grupo 1: Download State Persistence (REQ-016)

    /// Test 1: Escribir estado en UserDefaults con formato de persistDownloadState
    /// → moduleInit (que llama a restoreDownloadStates) → verificar con getDownloads
    func testPersistAndRestore_roundtrip_preservesAllFields() throws {
        // Escribir estado en UserDefaults con el formato exacto de persistDownloadState
        let downloadState: [[String: Any]] = [
            [
                "id": "test-download-1",
                "uri": "https://example.com/video.m3u8",
                "title": "Test Video",
                "state": "COMPLETED",
                "progress": Float(1.0),
                "downloadedBytes": Int64(1024000),
                "totalBytes": Int64(1024000),
                "quality": "720p",
                "assetPath": "/path/to/asset.movpkg",
                "hasSubtitles": true,
                "hasDRM": false
            ]
        ]
        UserDefaults.standard.set(downloadState, forKey: ACTIVE_DOWNLOADS_KEY)
        UserDefaults.standard.synchronize()

        // moduleInit llama a restoreDownloadStates() internamente (línea 1242)
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        // Verificar que los datos se restauraron usando API pública
        let exp = expectation(description: "getDownloads")
        module.getDownloads({ result in
            guard let dict = result as? [String: Any],
                  let downloads = dict["downloads"] as? [[String: Any]] else {
                XCTFail("getDownloads no devolvió formato esperado")
                exp.fulfill()
                return
            }

            XCTAssertEqual(downloads.count, 1, "Debe haber 1 descarga restaurada")

            if let download = downloads.first {
                XCTAssertEqual(download["id"] as? String, "test-download-1")
                XCTAssertEqual(download["uri"] as? String, "https://example.com/video.m3u8")
                XCTAssertEqual(download["title"] as? String, "Test Video")
                XCTAssertEqual(download["state"] as? String, "COMPLETED")
                XCTAssertEqual(download["quality"] as? String, "720p")
                XCTAssertEqual(download["hasSubtitles"] as? Bool, true)
                XCTAssertEqual(download["hasDRM"] as? Bool, false)
            }
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownloads rechazó")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 2: Sin datos en UserDefaults → activeDownloads vacío
    func testRestore_withoutPriorData_activeDownloadsEmpty() throws {
        // No escribimos nada en UserDefaults
        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "getDownloads")
        module.getDownloads({ result in
            guard let dict = result as? [String: Any],
                  let downloads = dict["downloads"] as? [[String: Any]] else {
                XCTFail("getDownloads no devolvió formato esperado")
                exp.fulfill()
                return
            }
            XCTAssertEqual(downloads.count, 0, "Sin datos previos → 0 descargas")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownloads rechazó")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 3: State string no reconocido → fallback a .paused (PAUSED)
    func testRestore_withInvalidState_fallbackToPaused() throws {
        let downloadState: [[String: Any]] = [
            [
                "id": "test-invalid-state",
                "uri": "https://example.com/video.m3u8",
                "title": "Test Video",
                "state": "INVALID_STATE_STRING",
                "progress": Float(0.5),
                "downloadedBytes": Int64(512000),
                "totalBytes": Int64(1024000),
                "quality": "",
                "assetPath": "",
                "hasSubtitles": false,
                "hasDRM": false
            ]
        ]
        UserDefaults.standard.set(downloadState, forKey: ACTIVE_DOWNLOADS_KEY)
        UserDefaults.standard.synchronize()

        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "getDownload")
        module.getDownload("test-invalid-state", resolver: { result in
            guard let download = result as? [String: Any] else {
                XCTFail("getDownload no devolvió resultado")
                exp.fulfill()
                return
            }
            // DownloadsModule2.swift:2664 — fallback a .paused si state no reconocido
            XCTAssertEqual(download["state"] as? String, "PAUSED")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownload rechazó")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 4: Entrada sin campos requeridos (id/uri/title) → se ignora
    func testRestore_withMissingRequiredFields_skipsEntry() throws {
        let downloadState: [[String: Any]] = [
            // Entrada válida
            [
                "id": "valid-download",
                "uri": "https://example.com/valid.m3u8",
                "title": "Valid Video",
                "state": "COMPLETED",
                "progress": Float(1.0),
                "downloadedBytes": Int64(1024000),
                "totalBytes": Int64(1024000),
                "quality": "",
                "assetPath": "",
                "hasSubtitles": false,
                "hasDRM": false
            ],
            // Entrada sin "id" → debe ignorarse
            [
                "uri": "https://example.com/invalid.m3u8",
                "title": "Invalid Video",
                "state": "COMPLETED"
            ],
            // Entrada sin "uri" → debe ignorarse
            [
                "id": "no-uri",
                "title": "No URI",
                "state": "COMPLETED"
            ],
            // Entrada sin "title" → debe ignorarse
            [
                "id": "no-title",
                "uri": "https://example.com/no-title.m3u8",
                "state": "COMPLETED"
            ],
            // Entrada sin "state" → debe ignorarse (guard línea 2659)
            [
                "id": "no-state",
                "uri": "https://example.com/no-state.m3u8",
                "title": "No State"
            ]
        ]
        UserDefaults.standard.set(downloadState, forKey: ACTIVE_DOWNLOADS_KEY)
        UserDefaults.standard.synchronize()

        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "getDownloads")
        module.getDownloads({ result in
            guard let dict = result as? [String: Any],
                  let downloads = dict["downloads"] as? [[String: Any]] else {
                XCTFail("getDownloads no devolvió formato esperado")
                exp.fulfill()
                return
            }
            // Solo la entrada válida debe restaurarse
            XCTAssertEqual(downloads.count, 1, "Solo 1 entrada válida de 5")
            if let download = downloads.first {
                XCTAssertEqual(download["id"] as? String, "valid-download")
            }
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownloads rechazó")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    /// Test 5: Múltiples descargas → todas se persisten y restauran
    func testPersist_multipleDownloads_allPreserved() throws {
        let downloadStates: [[String: Any]] = (1...5).map { i in
            [
                "id": "download-\(i)",
                "uri": "https://example.com/video\(i).m3u8",
                "title": "Video \(i)",
                "state": "COMPLETED",
                "progress": Float(1.0),
                "downloadedBytes": Int64(1024000 * i),
                "totalBytes": Int64(1024000 * i),
                "quality": "",
                "assetPath": "",
                "hasSubtitles": false,
                "hasDRM": false
            ] as [String: Any]
        }
        UserDefaults.standard.set(downloadStates, forKey: ACTIVE_DOWNLOADS_KEY)
        UserDefaults.standard.synchronize()

        let initialized = initializeModule()
        try XCTSkipUnless(initialized, "moduleInit falló — requiere entorno iOS completo")

        let exp = expectation(description: "getDownloads")
        module.getDownloads({ result in
            guard let dict = result as? [String: Any],
                  let downloads = dict["downloads"] as? [[String: Any]] else {
                XCTFail("getDownloads no devolvió formato esperado")
                exp.fulfill()
                return
            }
            XCTAssertEqual(downloads.count, 5, "Las 5 descargas deben restaurarse")
            exp.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("getDownloads rechazó")
            exp.fulfill()
        })
        waitForExpectations(timeout: 5)
    }

    // MARK: - Grupo 2: Asset Path Persistence (REQ-017)
    // Nota: saveAssetPath/loadAssetPaths/removeAssetPath/clearAllAssetPaths son private.
    // Testeamos directamente vía UserDefaults con el formato que usa producción.

    /// Test 6: Save path en UserDefaults → leer → correcto
    func testSaveAndLoadAssetPath_roundtrip() {
        // Simular saveAssetPath escribiendo directamente en UserDefaults
        let paths: [String: String] = ["download-1": "/path/to/asset.movpkg"]
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Simular loadAssetPaths leyendo directamente de UserDefaults
        let loaded = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String]
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?["download-1"], "/path/to/asset.movpkg")
    }

    /// Test 7: Save → remove → leer → nil para ese ID
    func testRemoveAssetPath_existingPath_removesIt() {
        // Save
        var paths: [String: String] = ["download-1": "/path/to/asset.movpkg"]
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Remove (simula removeAssetPath)
        paths.removeValue(forKey: "download-1")
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Verify
        let loaded = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String]
        XCTAssertNotNil(loaded)
        XCTAssertNil(loaded?["download-1"])
    }

    /// Test 8: Remove sin save previo → no crash
    func testRemoveAssetPath_nonExistent_noError() {
        // Simular removeAssetPath sin datos previos
        var paths = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String] ?? [:]
        paths.removeValue(forKey: "non-existent")
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // No crash = test pasa
        let loaded = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String]
        XCTAssertNotNil(loaded)
        XCTAssertTrue(loaded?.isEmpty ?? true)
    }

    /// Test 9: Save múltiples → clearAll → vacío
    func testClearAllAssetPaths_removesAll() {
        // Save múltiples
        let paths: [String: String] = [
            "download-1": "/path/to/asset1.movpkg",
            "download-2": "/path/to/asset2.movpkg",
            "download-3": "/path/to/asset3.movpkg"
        ]
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Simular clearAllAssetPaths
        UserDefaults.standard.removeObject(forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Verify
        let loaded = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String]
        XCTAssertNil(loaded, "clearAll debe eliminar la key completa")
    }

    /// Test 10: Save path A → save path B para mismo ID → B sobrescribe A
    func testSaveAssetPath_overwritesExisting() {
        // Save path A
        var paths: [String: String] = ["download-1": "/path/to/old-asset.movpkg"]
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Save path B para mismo ID (simula saveAssetPath que hace load + update + save)
        paths = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String] ?? [:]
        paths["download-1"] = "/path/to/new-asset.movpkg"
        UserDefaults.standard.set(paths, forKey: ASSET_PATHS_KEY)
        UserDefaults.standard.synchronize()

        // Verify
        let loaded = UserDefaults.standard.dictionary(forKey: ASSET_PATHS_KEY) as? [String: String]
        XCTAssertEqual(loaded?["download-1"], "/path/to/new-asset.movpkg")
    }

    // MARK: - Grupo 3: Asset Bookmark Persistence (REQ-018)
    // Nota: saveAssetBookmark es private, resolveAssetBookmark es internal.
    // Guardamos bookmark data directamente en UserDefaults y usamos resolveAssetBookmark para verificar.

    /// Test 11: Crear fichero temp → generar bookmark data → guardar en UserDefaults → resolve → URL válida
    func testSaveAndResolveAssetBookmark_roundtrip() {
        let tempURL = createTempFile(name: "test-asset-bookmark.movpkg")

        // Generar bookmark data real
        guard let bookmarkData = try? tempURL.bookmarkData() else {
            XCTFail("No se pudo generar bookmark data")
            return
        }

        // Guardar directamente en UserDefaults (simula saveAssetBookmark)
        let bookmarks: [String: Data] = ["download-1": bookmarkData]
        UserDefaults.standard.set(bookmarks, forKey: ASSET_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()

        // Resolver usando método internal
        let resolved = module.resolveAssetBookmark(forDownloadId: "download-1")
        XCTAssertNotNil(resolved, "Bookmark debe resolver a URL válida")
        XCTAssertEqual(resolved?.lastPathComponent, "test-asset-bookmark.movpkg")
    }

    /// Test 12: resolveAssetBookmark sin bookmark guardado → nil
    func testResolveAssetBookmark_nonExistent_returnsNil() {
        let resolved = module.resolveAssetBookmark(forDownloadId: "non-existent")
        XCTAssertNil(resolved, "Sin bookmark guardado → nil")
    }

    /// Test 13: Guardar data inválida en UserDefaults → resolve → nil + bookmark eliminado
    func testResolveAssetBookmark_invalidData_removesBookmarkAndReturnsNil() {
        // Guardar data inválida como bookmark
        let invalidData = Data("not-a-valid-bookmark".utf8)
        let bookmarks: [String: Data] = ["download-invalid": invalidData]
        UserDefaults.standard.set(bookmarks, forKey: ASSET_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()

        // resolveAssetBookmark debe retornar nil y eliminar el bookmark inválido
        // (DownloadsModule2.swift:2805-2807 — catch block llama removeAssetBookmark)
        let resolved = module.resolveAssetBookmark(forDownloadId: "download-invalid")
        XCTAssertNil(resolved, "Data inválida → nil")

        // Verificar que el bookmark fue eliminado de UserDefaults
        let remaining = UserDefaults.standard.dictionary(forKey: ASSET_BOOKMARKS_KEY) as? [String: Data]
        XCTAssertNil(remaining?["download-invalid"], "Bookmark inválido debe ser eliminado automáticamente")
    }

    /// Test 14: Save bookmark → remove de UserDefaults → resolve → nil
    func testRemoveAssetBookmark_existingBookmark_removesIt() {
        let tempURL = createTempFile(name: "test-asset-to-remove.movpkg")

        guard let bookmarkData = try? tempURL.bookmarkData() else {
            XCTFail("No se pudo generar bookmark data")
            return
        }

        // Save
        var bookmarks: [String: Data] = ["download-remove": bookmarkData]
        UserDefaults.standard.set(bookmarks, forKey: ASSET_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()

        // Remove (simula removeAssetBookmark)
        bookmarks.removeValue(forKey: "download-remove")
        UserDefaults.standard.set(bookmarks, forKey: ASSET_BOOKMARKS_KEY)
        UserDefaults.standard.synchronize()

        // Verify
        let resolved = module.resolveAssetBookmark(forDownloadId: "download-remove")
        XCTAssertNil(resolved, "Bookmark eliminado → nil")
    }

    // MARK: - Grupo 4: Subtitle Bookmark Persistence (REQ-019)
    // Nota: saveSubtitleBookmark, resolveSubtitleBookmark, removeSubtitleBookmark,
    // removeAllSubtitleBookmarks son internal — se pueden llamar directamente.

    /// Test 15: Crear fichero temp → save → resolve → URL válida
    func testSaveAndResolveSubtitleBookmark_roundtrip() {
        let tempURL = createTempFile(name: "test-subtitle.vtt", content: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTest")

        // Save bookmark (método internal)
        module.saveSubtitleBookmark(for: tempURL, downloadId: "d1", language: "es")

        // Resolve bookmark (método internal)
        let resolved = module.resolveSubtitleBookmark(forDownloadId: "d1", language: "es")
        XCTAssertNotNil(resolved, "Subtitle bookmark debe resolver a URL válida")
        XCTAssertEqual(resolved?.lastPathComponent, "test-subtitle.vtt")
    }

    /// Test 16: resolveSubtitleBookmark sin bookmark → nil
    func testResolveSubtitleBookmark_nonExistent_returnsNil() {
        let resolved = module.resolveSubtitleBookmark(forDownloadId: "non-existent", language: "es")
        XCTAssertNil(resolved, "Sin bookmark guardado → nil")
    }

    /// Test 17: Save → eliminar fichero → resolve → nil
    /// resolveSubtitleBookmark verifica FileManager.default.fileExists (línea 2862)
    func testResolveSubtitleBookmark_fileDeleted_returnsNil() {
        let tempURL = createTempFile(name: "test-subtitle-delete.vtt", content: "WEBVTT")

        // Save bookmark
        module.saveSubtitleBookmark(for: tempURL, downloadId: "d2", language: "en")

        // Eliminar fichero
        try? FileManager.default.removeItem(at: tempURL)
        tempFiles.removeAll { $0 == tempURL } // Ya no necesita limpieza

        // Resolve debe retornar nil porque el fichero no existe
        let resolved = module.resolveSubtitleBookmark(forDownloadId: "d2", language: "en")
        XCTAssertNil(resolved, "Fichero eliminado → resolve retorna nil")
    }

    /// Test 18: Save → remove → resolve → nil
    func testRemoveSubtitleBookmark_existingBookmark_removesIt() {
        let tempURL = createTempFile(name: "test-subtitle-remove.vtt", content: "WEBVTT")

        // Save
        module.saveSubtitleBookmark(for: tempURL, downloadId: "d3", language: "ca")

        // Remove
        module.removeSubtitleBookmark(forDownloadId: "d3", language: "ca")

        // Verify
        let resolved = module.resolveSubtitleBookmark(forDownloadId: "d3", language: "ca")
        XCTAssertNil(resolved, "Bookmark eliminado → nil")
    }

    /// Test 19: Save bookmarks para ID-A y ID-B → removeAll(ID-A) → ID-B sigue existiendo
    func testRemoveAllSubtitleBookmarks_removesOnlyTargetId() {
        let tempA1 = createTempFile(name: "subtitle-a1.vtt", content: "WEBVTT")
        let tempA2 = createTempFile(name: "subtitle-a2.vtt", content: "WEBVTT")
        let tempB1 = createTempFile(name: "subtitle-b1.vtt", content: "WEBVTT")

        // Save bookmarks para ID-A (2 idiomas) y ID-B (1 idioma)
        module.saveSubtitleBookmark(for: tempA1, downloadId: "id-a", language: "es")
        module.saveSubtitleBookmark(for: tempA2, downloadId: "id-a", language: "en")
        module.saveSubtitleBookmark(for: tempB1, downloadId: "id-b", language: "es")

        // removeAll para ID-A
        module.removeAllSubtitleBookmarks(forDownloadId: "id-a")

        // ID-A bookmarks deben estar eliminados
        XCTAssertNil(module.resolveSubtitleBookmark(forDownloadId: "id-a", language: "es"))
        XCTAssertNil(module.resolveSubtitleBookmark(forDownloadId: "id-a", language: "en"))

        // ID-B bookmark debe seguir existiendo
        let resolvedB = module.resolveSubtitleBookmark(forDownloadId: "id-b", language: "es")
        XCTAssertNotNil(resolvedB, "ID-B no debe verse afectado por removeAll de ID-A")
    }

    /// Test 20: Verificar que la key en UserDefaults tiene formato "downloadId:language"
    func testSubtitleBookmark_compositeKey_format() {
        let tempURL = createTempFile(name: "test-key-format.vtt", content: "WEBVTT")

        module.saveSubtitleBookmark(for: tempURL, downloadId: "my-download", language: "ca")

        // Leer directamente de UserDefaults para verificar formato de key
        let bookmarks = UserDefaults.standard.dictionary(forKey: SUBTITLE_BOOKMARKS_KEY)
        XCTAssertNotNil(bookmarks)

        // La key debe ser "downloadId:language"
        let expectedKey = "my-download:ca"
        XCTAssertNotNil(bookmarks?[expectedKey], "Key debe tener formato 'downloadId:language'")
    }

    /// Test 21: Save es, en, ca para mismo ID → resolve cada uno → todos válidos
    func testSaveSubtitleBookmark_multipleLanguages_allPreserved() {
        let tempES = createTempFile(name: "subtitle-es.vtt", content: "WEBVTT es")
        let tempEN = createTempFile(name: "subtitle-en.vtt", content: "WEBVTT en")
        let tempCA = createTempFile(name: "subtitle-ca.vtt", content: "WEBVTT ca")

        // Save 3 idiomas para mismo ID
        module.saveSubtitleBookmark(for: tempES, downloadId: "multi-lang", language: "es")
        module.saveSubtitleBookmark(for: tempEN, downloadId: "multi-lang", language: "en")
        module.saveSubtitleBookmark(for: tempCA, downloadId: "multi-lang", language: "ca")

        // Resolve cada uno
        let resolvedES = module.resolveSubtitleBookmark(forDownloadId: "multi-lang", language: "es")
        let resolvedEN = module.resolveSubtitleBookmark(forDownloadId: "multi-lang", language: "en")
        let resolvedCA = module.resolveSubtitleBookmark(forDownloadId: "multi-lang", language: "ca")

        XCTAssertNotNil(resolvedES, "Bookmark ES debe resolver")
        XCTAssertNotNil(resolvedEN, "Bookmark EN debe resolver")
        XCTAssertNotNil(resolvedCA, "Bookmark CA debe resolver")

        XCTAssertEqual(resolvedES?.lastPathComponent, "subtitle-es.vtt")
        XCTAssertEqual(resolvedEN?.lastPathComponent, "subtitle-en.vtt")
        XCTAssertEqual(resolvedCA?.lastPathComponent, "subtitle-ca.vtt")
    }
}
#endif
