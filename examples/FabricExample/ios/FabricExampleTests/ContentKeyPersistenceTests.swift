import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: ContentKey Persistence
// Tarea 04 | Fase A: Red de seguridad
// Captura el comportamiento actual de la persistencia de claves FairPlay.
// NO usar ContentKeyManager.sharedManager — reproducimos la lógica con dir temporal.
// NO modificar código de producción. Si un test falla, ajustar el test.

class ContentKeyPersistenceTests: XCTestCase {

    private var tempKeyDirectory: URL!

    override func setUp() {
        super.setUp()
        // Crear directorio temporal para claves (simula contentKeyDirectory)
        tempKeyDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-keys-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempKeyDirectory, withIntermediateDirectories: true)
    }

    override func tearDown() {
        // Limpiar directorio temporal
        try? FileManager.default.removeItem(at: tempKeyDirectory)
        tempKeyDirectory = nil
        super.tearDown()
    }

    // MARK: - Helpers

    /// Reproduce el formato de URL de producción (ContentKeyManager.swift:620)
    /// `contentKeyDirectory.appendingPathComponent("\(assetName)-\(keyIV)-Key")`
    private func urlForKey(assetName: String, keyIV: String) -> URL {
        return tempKeyDirectory.appendingPathComponent("\(assetName)-\(keyIV)-Key")
    }

    /// Escribe una clave en disco (reproduce writePersistableContentKey, línea 588)
    private func writeKey(data: Data, assetName: String, keyIV: String) throws {
        let fileURL = urlForKey(assetName: assetName, keyIV: keyIV)
        try data.write(to: fileURL, options: .atomicWrite)
    }

    /// Verifica si una clave existe en disco (reproduce persistableContentKeyExistsOnDisk, línea 603)
    private func keyExists(assetName: String, keyIV: String) -> Bool {
        let fileURL = urlForKey(assetName: assetName, keyIV: keyIV)
        return FileManager.default.fileExists(atPath: fileURL.path)
    }

    /// Elimina una clave del disco (reproduce deletePeristableContentKey, línea 626)
    /// keyId formato: "skd://keyId:keyIV" o "keyId:keyIV"
    private func deleteKey(assetName: String, keyId: String) {
        let contentIdentifier = keyId.replacingOccurrences(of: "skd://", with: "")
        let components = contentIdentifier.components(separatedBy: ":")
        guard components.count >= 2 else {
            return // Formato inválido — retorna sin hacer nada
        }
        let keyIV = components[1]

        guard keyExists(assetName: assetName, keyIV: keyIV) else {
            return // No existe — retorna sin hacer nada
        }

        let fileURL = urlForKey(assetName: assetName, keyIV: keyIV)
        try? FileManager.default.removeItem(at: fileURL)
    }

    // MARK: - Tests

    /// Test 1: Write → read → datos coinciden
    func testWriteAndRead_roundtrip() throws {
        let keyData = Data("test-content-key-data-12345".utf8)
        try writeKey(data: keyData, assetName: "test-asset", keyIV: "iv001")

        let fileURL = urlForKey(assetName: "test-asset", keyIV: "iv001")
        let readData = try Data(contentsOf: fileURL)
        XCTAssertEqual(readData, keyData, "Datos leídos deben coincidir con los escritos")
    }

    /// Test 2: Verificar formato de URL: {assetName}-{keyIV}-Key
    func testUrlForPersistableContentKey_format() {
        let url = urlForKey(assetName: "my-asset", keyIV: "abc123")
        XCTAssertEqual(url.lastPathComponent, "my-asset-abc123-Key")
    }

    /// Test 3: Write → exists → true
    func testPersistableContentKeyExists_afterWrite_true() throws {
        let keyData = Data("key-data".utf8)
        try writeKey(data: keyData, assetName: "asset-exists", keyIV: "iv002")

        XCTAssertTrue(keyExists(assetName: "asset-exists", keyIV: "iv002"))
    }

    /// Test 4: Sin write → exists → false
    func testPersistableContentKeyExists_beforeWrite_false() {
        XCTAssertFalse(keyExists(assetName: "non-existent-asset", keyIV: "iv999"))
    }

    /// Test 5: Write → delete → not exists
    func testDelete_existingKey_removesFile() throws {
        let keyData = Data("key-to-delete".utf8)
        try writeKey(data: keyData, assetName: "asset-del", keyIV: "iv003")
        XCTAssertTrue(keyExists(assetName: "asset-del", keyIV: "iv003"))

        // deletePeristableContentKey espera keyId formato "skd://keyId:keyIV"
        deleteKey(assetName: "asset-del", keyId: "skd://someKeyId:iv003")

        XCTAssertFalse(keyExists(assetName: "asset-del", keyIV: "iv003"), "Clave debe estar eliminada")
    }

    /// Test 6: Delete sin write previo → no crash
    func testDelete_nonExistentKey_noError() {
        // No debe crashear
        deleteKey(assetName: "non-existent", keyId: "skd://keyId:ivXXX")
        // Si llegamos aquí, el test pasa
        XCTAssertFalse(keyExists(assetName: "non-existent", keyIV: "ivXXX"))
    }

    /// Test 7: Write 3 claves → deleteAll → ninguna existe
    func testDeleteAll_multipleKeys_removesAll() throws {
        // Escribir 3 claves para el mismo asset
        let keyIds = ["skd://key1:iv-a", "skd://key2:iv-b", "skd://key3:iv-c"]
        let keyIVs = ["iv-a", "iv-b", "iv-c"]

        for keyIV in keyIVs {
            try writeKey(data: Data("key-\(keyIV)".utf8), assetName: "multi-asset", keyIV: keyIV)
        }

        // Verificar que existen
        for keyIV in keyIVs {
            XCTAssertTrue(keyExists(assetName: "multi-asset", keyIV: keyIV))
        }

        // deleteAll (reproduce deleteAllPeristableContentKeys, línea 712)
        for keyId in keyIds {
            deleteKey(assetName: "multi-asset", keyId: keyId)
        }

        // Verificar que ninguna existe
        for keyIV in keyIVs {
            XCTAssertFalse(keyExists(assetName: "multi-asset", keyIV: keyIV),
                          "Clave \(keyIV) debe estar eliminada")
        }
    }

    /// Test 8: keyId sin ":" separator → no crash, no delete
    func testDelete_invalidKeyIdFormat_noError() throws {
        // Escribir una clave válida
        try writeKey(data: Data("valid-key".utf8), assetName: "asset-fmt", keyIV: "iv-valid")

        // Intentar delete con formato inválido (sin ":")
        deleteKey(assetName: "asset-fmt", keyId: "skd://invalidFormatNoColon")

        // La clave original debe seguir existiendo (delete no hizo nada)
        XCTAssertTrue(keyExists(assetName: "asset-fmt", keyIV: "iv-valid"),
                     "Clave no debe eliminarse con keyId de formato inválido")
    }
}
