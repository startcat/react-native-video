import XCTest
@testable import react_native_video

// MARK: - Tests de contrato: DataStructures parsing
// Tarea 04 | Fase A: Red de seguridad
// Captura el comportamiento actual del parseo de NSDictionary
// para VideoSource, DRMParams, TextTrack, Chapter.
// NO modificar código de producción. Si un test falla, ajustar el test.

class DataStructureParsingTests: XCTestCase {

    // MARK: - VideoSource

    /// Test 14: Dict completo → todos los campos parseados
    func testVideoSource_completeDict_allFieldsParsed() {
        let dict: NSDictionary = [
            "type": "mp4",
            "uri": "https://example.com/video.mp4",
            "id": "video-123",
            "title": "Test Video",
            "isNetwork": true,
            "isAsset": false,
            "shouldCache": true,
            "startPosition": 10.5,
            "cropStart": 1000.0,
            "cropEnd": 5000.0
        ]

        let source = VideoSource(dict)
        XCTAssertEqual(source.type, "mp4")
        XCTAssertEqual(source.uri, "https://example.com/video.mp4")
        XCTAssertEqual(source.id, "video-123")
        XCTAssertEqual(source.title, "Test Video")
        XCTAssertEqual(source.isNetwork, true)
        XCTAssertEqual(source.isAsset, false)
        XCTAssertEqual(source.shouldCache, true)
        XCTAssertEqual(source.startPosition, 10.5)
        XCTAssertEqual(source.cropStart, 1000)
        XCTAssertEqual(source.cropEnd, 5000)
        XCTAssertNotNil(source.json)
    }

    /// Test 15: nil dict → defaults
    func testVideoSource_nilDict_defaults() {
        let source = VideoSource(nil)
        XCTAssertNil(source.type)
        XCTAssertNil(source.uri)
        XCTAssertNil(source.id)
        XCTAssertNil(source.title)
        XCTAssertEqual(source.isNetwork, false)
        XCTAssertEqual(source.isAsset, false)
        XCTAssertEqual(source.shouldCache, false)
        XCTAssertNil(source.requestHeaders)
        XCTAssertNil(source.startPosition)
        XCTAssertNil(source.cropStart)
        XCTAssertNil(source.cropEnd)
        XCTAssertNil(source.json)
    }

    /// Test 16: id como Int → convertido a String
    func testVideoSource_idAsInt_convertedToString() {
        let dict: NSDictionary = [
            "id": 42,
            "uri": "https://example.com/video.mp4"
        ]

        let source = VideoSource(dict)
        XCTAssertEqual(source.id, "42", "id Int debe convertirse a String")
    }

    /// Test 17: requestHeaders array → diccionario plano
    func testVideoSource_requestHeaders_parsed() {
        let dict: NSDictionary = [
            "uri": "https://example.com/video.mp4",
            "requestHeaders": [
                ["key": "Authorization", "value": "Bearer token123"],
                ["key": "X-Custom", "value": "custom-value"]
            ]
        ]

        let source = VideoSource(dict)
        XCTAssertNotNil(source.requestHeaders)
        XCTAssertEqual(source.requestHeaders?["Authorization"] as? String, "Bearer token123")
        XCTAssertEqual(source.requestHeaders?["X-Custom"] as? String, "custom-value")
    }

    // MARK: - DRMParams

    /// Test 18: Dict completo → todos los campos parseados
    func testDRMParams_completeDict_allFieldsParsed() {
        let dict: NSDictionary = [
            "type": "fairplay",
            "licenseServer": "https://drm.example.com/license",
            "contentId": "content-456",
            "certificateUrl": "https://drm.example.com/cert",
            "base64Certificate": true
        ]

        let drm = DRMParams(dict)
        XCTAssertEqual(drm.type, "fairplay")
        XCTAssertEqual(drm.licenseServer, "https://drm.example.com/license")
        XCTAssertEqual(drm.contentId, "content-456")
        XCTAssertEqual(drm.certificateUrl, "https://drm.example.com/cert")
        XCTAssertEqual(drm.base64Certificate, true)
        XCTAssertNotNil(drm.json)
    }

    /// Test 19: nil dict → defaults (all nil)
    func testDRMParams_nilDict_defaults() {
        let drm = DRMParams(nil)
        XCTAssertNil(drm.type)
        XCTAssertNil(drm.licenseServer)
        XCTAssertNil(drm.contentId)
        XCTAssertNil(drm.certificateUrl)
        XCTAssertNil(drm.base64Certificate)
        XCTAssertNil(drm.headers)
        XCTAssertNil(drm.json)
    }

    /// Test 20: Con headers → parsea array a diccionario plano
    func testDRMParams_withHeaders_parsed() {
        let dict: NSDictionary = [
            "type": "fairplay",
            "headers": [
                ["key": "X-DRM-Token", "value": "drm-token-123"],
                ["key": "X-Custom-Header", "value": "custom"]
            ]
        ]

        let drm = DRMParams(dict)
        XCTAssertNotNil(drm.headers)
        XCTAssertEqual(drm.headers?["X-DRM-Token"] as? String, "drm-token-123")
        XCTAssertEqual(drm.headers?["X-Custom-Header"] as? String, "custom")
    }

    // MARK: - TextTrack

    /// Test 21: Dict completo → todos los campos parseados
    func testTextTrack_completeDict_allFieldsParsed() {
        let dict: NSDictionary = [
            "type": "text/vtt",
            "language": "es",
            "title": "Español",
            "uri": "https://example.com/subs_es.vtt",
            "index": 0
        ]

        let track = TextTrack(dict)
        XCTAssertEqual(track.type, "text/vtt")
        XCTAssertEqual(track.language, "es")
        XCTAssertEqual(track.title, "Español")
        XCTAssertEqual(track.uri, "https://example.com/subs_es.vtt")
        XCTAssertEqual(track.index, 0)
        XCTAssertNotNil(track.json)
    }

    /// Test 22: nil dict → defaults (empty strings, nil index)
    func testTextTrack_nilDict_defaults() {
        let track = TextTrack(nil)
        XCTAssertEqual(track.type, "")
        XCTAssertEqual(track.language, "")
        XCTAssertEqual(track.title, "")
        XCTAssertEqual(track.uri, "")
        XCTAssertNil(track.index)
        XCTAssertNil(track.json)
    }

    /// Test 23: Init con index explícito → usa parámetro, no json
    func testTextTrack_withExplicitIndex_usesIndex() {
        let dict: NSDictionary = [
            "type": "text/vtt",
            "language": "en",
            "title": "English",
            "uri": "https://example.com/subs_en.vtt",
            "index": 99 // Este index del json se ignora
        ]

        let track = TextTrack(dict, index: 5)
        XCTAssertEqual(track.index, 5, "Debe usar el index del parámetro, no del json")
        XCTAssertEqual(track.language, "en")
        // Verificar que el json tiene el index actualizado
        XCTAssertEqual(track.json?["index"] as? Int, 5)
    }

    // MARK: - Chapter

    /// Test 27: Dict completo → todos los campos parseados
    func testChapter_completeDict_allFieldsParsed() {
        let dict: NSDictionary = [
            "title": "Chapter 1: Introduction",
            "uri": "https://example.com/thumb1.jpg",
            "startTime": 0.0,
            "endTime": 120.5
        ]

        let chapter = Chapter(dict)
        XCTAssertEqual(chapter.title, "Chapter 1: Introduction")
        XCTAssertEqual(chapter.uri, "https://example.com/thumb1.jpg")
        XCTAssertEqual(chapter.startTime, 0.0)
        XCTAssertEqual(chapter.endTime, 120.5)
        XCTAssertNotNil(chapter.json)
    }

    /// Test 28: nil dict → defaults (empty string, nil, 0)
    func testChapter_nilDict_defaults() {
        let chapter = Chapter(nil)
        XCTAssertEqual(chapter.title, "")
        XCTAssertNil(chapter.uri)
        XCTAssertEqual(chapter.startTime, 0)
        XCTAssertEqual(chapter.endTime, 0)
        XCTAssertNil(chapter.json)
    }
}
