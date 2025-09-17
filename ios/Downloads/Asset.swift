//
//  Copyright © 2020 Axinom. All rights reserved.
//
//  A class that holds information about an Asset
//  Adds Asset's AVURLAsset as a recipient to the Playback Content Key Session in a protected playback/download use case.
//
//  DownloadState extension is used to track the download states of Assets,
//  Keys extension is used to define a number of values to use as keys in dictionary lookups.
//

import AVFoundation

class Asset {
    
    var id: String
    var name: String
    var url: URL
    var contentKeyIdList: [String]?
    var urlAsset: AVURLAsset?
    
    init(name: String, url: URL, id: String? = "") {
        // Validate input parameters
        if name.isEmpty {
            RCTLog("[Native Downloads] (Asset) WARNING: Asset name is empty, using URL as fallback")
        }
        
        self.id = id ?? ""
        self.name = name.isEmpty ? url.lastPathComponent : name
        self.url = url
        self.contentKeyIdList = [String]()
        
        RCTLog("[Native Downloads] (Asset) Creating Asset with url: \(url) name: \(self.name) id: \(String(describing: id))")
        
        createUrlAsset()
    }
    
    // Link AVURLAsset to Content Key Session
    func addAsContentKeyRecipient() {
        RCTLog("[Native Downloads] (Asset) Adding AVURLAsset as a recipient to the Content Key Session")
        
        guard let urlAsset = urlAsset else {
            RCTLog("[Native Downloads] (Asset) ERROR: Cannot add nil urlAsset as content key recipient")
            return
        }
        
        guard let contentKeySession = ContentKeyManager.sharedManager.contentKeySession else {
            RCTLog("[Native Downloads] (Asset) ERROR: ContentKeySession is not available")
            return
        }
        
        contentKeySession.addContentKeyRecipient(urlAsset)
        RCTLog("[Native Downloads] (Asset) Successfully added urlAsset as content key recipient")
    }
    
    // Using different AVURLAsset to allow simultaneous playback and download
    func createUrlAsset() {
        do {
            urlAsset = AVURLAsset(url: url)
            RCTLog("[Native Downloads] (Asset) Successfully created AVURLAsset for: \(url)")
        } catch {
            RCTLog("[Native Downloads] (Asset) ERROR: Failed to create AVURLAsset for \(url): \(error)")
            urlAsset = nil
        }
    }
}

/*
 Extends `Asset` to add a simple download state enumeration used by the sample
 to track the download states of Assets.
 */
extension Asset {
    enum DownloadState: String {
        case notDownloaded
        case downloading
        case downloadedAndSavedToDevice
    }
}

/*
 Extends `Asset` to define a number of values to use as keys in dictionary lookups.
 */
extension Asset {
    struct Keys {
        /*
         Key for the Asset name, used for `AssetDownloadProgressNotification` and
         `AssetDownloadStateChangedNotification` Notifications as well as
         AssetListManager.
         */
        static let name = "AssetNameKey"
        
        /*
         Key for the Asset download percentage, used for
         `AssetDownloadProgressNotification` Notification.
         */
        static let percentDownloaded = "AssetPercentDownloadedKey"
        
        /*
         Key for the Asset download state, used for
         `AssetDownloadStateChangedNotification` Notification.
         */
        static let downloadState = "AssetDownloadStateKey"
        
        /*
         Key for the Asset download AVMediaSelection display Name, used for
         `AssetDownloadStateChangedNotification` Notification.
         */
        static let downloadSelectionDisplayName = "AssetDownloadSelectionDisplayNameKey"
      
        static let url = "AssetDownloadSelectionURL"
      
        static let id = "id"
    }
}
