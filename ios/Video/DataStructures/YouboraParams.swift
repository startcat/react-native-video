struct YouboraParams {
    let accountCode: String?
    let contentTransactionCode: String?
    let username: String?
    let contentId: String?
    let contentType: String?
    let contentTitle: String?
    let contentTitle2: String?
    let program: String?
    let contentIsLive: Bool
    let contentPlaybackType: String?
    let contentTvShow: String?
    let contentSeason: String?
    let contentChannel: String?
    let contentEpisodeTitle: String?
    let contentLanguage: String?
    let extraparam1: String?
    let extraparam2: String?
    let extraparam3: String?
    let extraparam4: String?
    let extraparam5: String?
    let extraparam6: String?
    let extraparam7: String?
    let extraparam8: String?
    let extraparam9: String?
    let extraparam10: String?
    
    let json: NSDictionary?
    
    init(_ json: NSDictionary!) {
      
        guard json != nil else {
            self.json = nil
            self.accountCode = nil
            self.contentTransactionCode = nil
            self.username = nil
            self.contentId = nil
            self.contentType = nil
            self.contentTitle = nil
            self.contentTitle2 = nil
            self.program = nil
            self.contentChannel = nil
            self.contentIsLive = false
            self.contentPlaybackType = nil
            self.contentTvShow = nil
            self.contentSeason = nil
            self.contentEpisodeTitle = nil
            self.contentLanguage = nil
          
            self.extraparam1 = nil
            self.extraparam2 = nil
            self.extraparam3 = nil
            self.extraparam4 = nil
            self.extraparam5 = nil
            self.extraparam6 = nil
            self.extraparam7 = nil
            self.extraparam8 = nil
            self.extraparam9 = nil
            self.extraparam10 = nil
            return
        }
      
        self.json = json
        self.accountCode = json["accountCode"] as? String
        self.contentTransactionCode = json["contentTransactionCode"] as? String
        self.username = json["username"] as? String
        self.contentId = json["contentId"] as? String
        self.contentType = json["contentType"] as? String
        self.contentTitle = json["contentTitle"] as? String
        self.contentTitle2 = json["contentTitle2"] as? String
        self.program = json["program"] as? String
        self.contentChannel = json["contentChannel"] as? String
        self.contentIsLive = (json["contentIsLive"] as? Bool)!
        self.contentPlaybackType = json["contentPlaybackType"] as? String
        self.contentTvShow = json["contentTvShow"] as? String
        self.contentSeason = json["contentSeason"] as? String
        self.contentEpisodeTitle = json["contentEpisodeTitle"] as? String
        self.contentLanguage = json["contentLanguage"] as? String
      
        self.extraparam1 = json["extraparam1"] as? String
        self.extraparam2 = json["extraparam2"] as? String
        self.extraparam3 = json["extraparam3"] as? String
        self.extraparam4 = json["extraparam4"] as? String
        self.extraparam5 = json["extraparam5"] as? String
        self.extraparam6 = json["extraparam6"] as? String
        self.extraparam7 = json["extraparam7"] as? String
        self.extraparam8 = json["extraparam8"] as? String
        self.extraparam9 = json["extraparam9"] as? String
        self.extraparam10 = json["extraparam10"] as? String

    }
}
