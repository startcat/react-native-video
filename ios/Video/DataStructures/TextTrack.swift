struct TextTrack {
    let type: String
    let language: String
    let title: String
    let uri: String
    let index: Int?

    let json: NSDictionary?

    init(_ json: NSDictionary!) {
        guard json != nil else {
            self.json = nil
            self.type = ""
            self.language = ""
            self.title = ""
            self.uri = ""
            self.index = nil
            return
        }
        self.type = json["type"] as? String ?? ""
        self.language = json["language"] as? String ?? ""
        self.title = json["title"] as? String ?? ""
        self.uri = json["uri"] as? String ?? ""
        self.index = json["index"] as? Int
        
        // Reconstruimos el json para asegurar que siempre tenga index
        self.json = json
    }
    
    // Inicializador con index explícito (para cuando se genera desde el código)
    init(_ json: NSDictionary!, index: Int) {
        guard json != nil else {
            self.json = nil
            self.type = ""
            self.language = ""
            self.title = ""
            self.uri = ""
            self.index = index
            return
        }
        self.type = json["type"] as? String ?? ""
        self.language = json["language"] as? String ?? ""
        self.title = json["title"] as? String ?? ""
        self.uri = json["uri"] as? String ?? ""
        self.index = index
        
        // Creamos un nuevo json que incluya el index
        let mutableJson = NSMutableDictionary(dictionary: json)
        mutableJson["index"] = NSNumber(value: index)
        self.json = mutableJson
    }
}
