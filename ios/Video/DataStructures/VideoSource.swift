struct VideoSource {
    let type: String?
    let uri: String?
    // Dani - Añadimos campos para el offline
    let id: String?
    let title: String?
    // Fin
    let isNetwork: Bool
    let isAsset: Bool
    let shouldCache: Bool
    let requestHeaders: [String: Any]?
    let startPosition: Float64?
    let cropStart: Int64?
    let cropEnd: Int64?
    let customMetadata: CustomMetadata?

    let json: NSDictionary?

    init(_ json: NSDictionary!) {
        guard json != nil else {
            self.json = nil
            self.type = nil
            self.uri = nil

            // Dani - Añadimos campos para el offline
            self.title = nil
            self.id = nil
            // Fin

            self.isNetwork = false
            self.isAsset = false
            self.shouldCache = false
            self.requestHeaders = nil
            self.startPosition = nil
            self.cropStart = nil
            self.cropEnd = nil
            self.customMetadata = nil
            return
        }
        self.json = json
        self.type = json["type"] as? String
        self.uri = json["uri"] as? String

        // Dani - Añadimos campos para el offline
        // Handle id as either String or Int
        if let idString = json["id"] as? String {
            self.id = idString
        } else if let idInt = json["id"] as? Int {
            self.id = String(idInt)
        } else {
            self.id = nil
        }
        self.title = json["title"] as? String
        // Fin

        self.isNetwork = json["isNetwork"] as? Bool ?? false
        self.isAsset = json["isAsset"] as? Bool ?? false
        self.shouldCache = json["shouldCache"] as? Bool ?? false
        if let requestHeaders = json["requestHeaders"] as? [[String: Any]] {
            var _requestHeaders: [String: Any] = [:]
            for requestHeader in requestHeaders {
                if let key = requestHeader["key"] as? String, let value = requestHeader["value"] {
                    _requestHeaders[key] = value
                }
            }
            self.requestHeaders = _requestHeaders
        } else {
            self.requestHeaders = nil
        }
        self.startPosition = json["startPosition"] as? Float64
        self.cropStart = (json["cropStart"] as? Float64).flatMap { Int64(round($0)) }
        self.cropEnd = (json["cropEnd"] as? Float64).flatMap { Int64(round($0)) }
        self.customMetadata = CustomMetadata(json["metadata"] as? NSDictionary)
    }
}
