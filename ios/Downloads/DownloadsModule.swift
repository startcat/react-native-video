import Foundation
import AVFoundation
import AVKit
import React
import Promises

@objc(DownloadsModule)
class DownloadsModule: RCTEventEmitter {
  
  public static var emitter: RCTEventEmitter!
  
  // Asset downloader
  fileprivate var downloader: AssetDownloader = AssetDownloader.sharedDownloader
  
  // Struct representing a Stream parsed from JSON
  struct StreamData: Codable, Hashable {
      let title: String
      let videoUrl: String
      let licenseServer: String
      let fpsCertificateUrl: String
      let licenseToken: String
  }
  
  override init() {
      super.init()
      DownloadsModule.emitter = self
  }
  
  @objc override static func requiresMainQueueSetup() -> Bool { return true }
  
  // Events
  @objc var onDownloadProgress: RCTDirectEventBlock?
  @objc var onLicenseDownloaded: RCTDirectEventBlock?
  @objc var onLicenseDownloadFailed: RCTDirectEventBlock?
  @objc var onLicenseCheck: RCTDirectEventBlock?
  @objc var onLicenseCheckFailed: RCTDirectEventBlock?
  @objc var onLicenseReleased: RCTDirectEventBlock?
  @objc var onLicenseReleasedFailed: RCTDirectEventBlock?
  @objc var onLicenseKeysRestored: RCTDirectEventBlock?
  @objc var onLicenseRestoreFailed: RCTDirectEventBlock?
  @objc var onAllLicensesReleased: RCTDirectEventBlock?
  @objc var onAllLicensesReleaseFailed: RCTDirectEventBlock?
  @objc var onDownloadStateChanged: RCTDirectEventBlock?
  @objc var onPrepared: RCTDirectEventBlock?
  @objc var onPrepareError: RCTDirectEventBlock?
  
  
  
  @objc(moduleInit:rejecter:)
  func moduleInit(_ resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    
    addObservers()
    resolve(nil)
    
  }
  
  @objc(pauseAll:rejecter:)
  func pauseAll(_ resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    resolve(nil)
    
  }

  @objc(resumeAll:rejecter:)
  func resumeAll(_ resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    resolve(nil)
    
  }
  
  @objc(pause:drm:resolver:rejecter:)
  func pause(_ src: NSDictionary, drm: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
      
      let asset:Asset = Asset(name:src.value(forKey: "title") as! String, url:(URL(string: src.value(forKey: "uri") as! String) ?? URL(string: "https://"))!)
      downloader.pauseDownloadOfAsset(asset: asset)
      resolve(nil)
    
  }

  @objc(resume:drm:resolver:rejecter:)
  func resume(_ src: NSDictionary, drm: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    
      let asset:Asset = Asset(name:src.value(forKey: "title") as! String, url:(URL(string: src.value(forKey: "uri") as! String) ?? URL(string: "https://"))!)
      downloader.resumeDownloadOfAsset(asset: asset)
      resolve(nil)
    
  }

  @objc(getList:rejecter:)
  func getList(_ resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    resolve(nil)
  }

  @objc(addItem:drm:resolver:rejecter:)
  func addItem(_ src: NSDictionary, drm: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    
    let asset:Asset = Asset(name:src.value(forKey: "title") as! String, url:(URL(string: src.value(forKey: "uri") as! String) ?? URL(string: "https://"))!)
    
    let chosenStream: StreamData
      
    if (drm == nil){
      chosenStream = StreamData(title: src.value(forKey: "title") as! String, videoUrl: src.value(forKey: "uri") as! String, licenseServer: "", fpsCertificateUrl: "", licenseToken: "")
    } else {
      chosenStream = StreamData(title: src.value(forKey: "title") as! String, videoUrl: src.value(forKey: "uri") as! String, licenseServer: drm?.value(forKey: "licenseServer") as! String, fpsCertificateUrl: drm?.value(forKey: "certificateUrl") as! String, licenseToken: "")
    }
    
    // Assume that only protected streams will have Licensing Server Url in Streams.json
    let isProtectedPlayback = !chosenStream.licenseServer.isEmpty
    
    if (isProtectedPlayback) {
      // Creting Content Key Session
      ContentKeyManager.sharedManager.createContentKeySession()
        
      // Licensing Service Url
      ContentKeyManager.sharedManager.licensingServiceUrl = chosenStream.licenseServer
        
      // Licensing Token
      ContentKeyManager.sharedManager.licensingToken = chosenStream.licenseToken
        
      // Certificate Url
      ContentKeyManager.sharedManager.fpsCertificateUrl = chosenStream.fpsCertificateUrl
      
      ContentKeyManager.sharedManager.downloadRequestedByUser = true
      
      asset.createUrlAsset()
      asset.addAsContentKeyRecipient()
      ContentKeyManager.sharedManager.asset = asset

    } else {
      ContentKeyManager.sharedManager.createContentKeySession()
      ContentKeyManager.sharedManager.downloadRequestedByUser = true
      asset.createUrlAsset()
      asset.addAsContentKeyRecipient()
      ContentKeyManager.sharedManager.asset = asset
      
    }
    
    let downloadState = downloader.downloadStateOfAsset(asset: asset)
    
    // Initiate download if not already downloaded
    if downloadState != Asset.DownloadState.downloadedAndSavedToDevice && ContentKeyManager.sharedManager.downloadRequestedByUser {
      downloadStream(asset)
      //ContentKeyManager.sharedManager.downloadRequestedByUser = false
      resolve(nil)
      
    } else if downloadState == Asset.DownloadState.downloadedAndSavedToDevice {
      reject(nil, "COMPLETED", nil)
      
    } else if downloadState == Asset.DownloadState.downloading {
      reject(nil, "DOWNLOADING", nil)
      
    } else if downloadState == Asset.DownloadState.notDownloaded {
      reject(nil, "NOT_DOWNLOADED", nil)
      
    } else {
      reject(nil, nil, nil)
      
    }
    
  }

  @objc(removeItem:drm:resolver:rejecter:)
  func removeItem(_ src: NSDictionary, drm: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    
    let asset:Asset = Asset(name:src.value(forKey: "title") as! String, url:(URL(string: src.value(forKey: "uri") as! String) ?? URL(string: "https://"))!)
    
    // Remove Content Key from the device
    ContentKeyManager.sharedManager.deleteAllPeristableContentKeys(forAsset: asset)
    
    downloader.deleteDownloadedAsset(asset: asset)
    resolve(nil)
    
  }

  @objc(getItem:resolver:rejecter:)
  func getItem(_ uri:String, resolve: @escaping RCTPromiseResolveBlock,reject: @escaping RCTPromiseRejectBlock) -> Void {
    reject(nil, nil, nil)
    
  }
  
  func downloadStream(_ asset:Asset) -> String {
    
    let downloadState = downloader.downloadStateOfAsset(asset: asset)
    
    // Initiate download if not already downloaded
    if downloadState != Asset.DownloadState.downloadedAndSavedToDevice && ContentKeyManager.sharedManager.downloadRequestedByUser {
      downloader.download(asset: asset)
      //ContentKeyManager.sharedManager.downloadRequestedByUser = false
      return "SUCCESS"
      
    } else if downloadState == Asset.DownloadState.downloadedAndSavedToDevice {
      return "COMPLETED"
      
    } else if downloadState == Asset.DownloadState.downloading {
      return "DOWNLOADING"
      
    } else if downloadState == Asset.DownloadState.notDownloaded {
      return "NOT_DOWNLOADED"
      
    } else {
      return ""
      
    }
    
  }
  
  func addObservers() {
    
    // [MANDATORY] ContentKey delegate did save a Persistable Content Key
    NotificationCenter.default.addObserver(self, selector: #selector(handleContentKeyDelegateHasAvailablePersistableContentKey(notification:)), name: .HasAvailablePersistableContentKey, object: nil)
    
    // [MANDATORY] State of downloading process is changed
    NotificationCenter.default.addObserver(self, selector: #selector(handleAssetDownloadStateChanged(_:)), name: .AssetDownloadStateChanged, object: nil)
    
    // [MANDATORY] Track asset download progress
    NotificationCenter.default.addObserver(self, selector: #selector(handleAssetDownloadProgress(_:)),name: .AssetDownloadProgress, object:nil)
    
  }
  
  @objc open override func supportedEvents() -> [String] {
    return ["onDownloadStateChanged", "downloadProgress", "onLicenseDownloaded", "onLicenseDownloadFailed", "onLicenseCheck", "onLicenseCheckFailed", "onLicenseReleased", "onLicenseReleasedFailed", "onLicenseKeysRestored", "onLicenseRestoreFailed", "onAllLicensesReleased", "onAllLicensesReleaseFailed", "onPrepared", "onPrepareError", "downloadCompleted", "downloadRemoved"]
    
  }
  
  // Begin with stream download process after .ContentKeyDelegateHasAvailablePersistableContentKey notification is received
  @objc func handleContentKeyDelegateHasAvailablePersistableContentKey(notification: Notification) {

    RCTLog("[Native Downloads] (DownloadsModule) Persistable Content Key is now available")
    
    //let asset:Asset = Asset(name:(notification.userInfo![Asset.Keys.name] as? String)!, url:(URL(string: (notification.userInfo![Asset.Keys.url] as? String)!) ?? URL(string: "https://"))!)
      
    // Initiate download if not already downloaded
    //let result:String = downloadStream(asset)
    
    //if result == "SUCCESS" {
      //ContentKeyManager.sharedManager.downloadRequestedByUser = false
      
    //}
    
  }
  
  // Reacting to asset download state changes
  @objc func handleAssetDownloadStateChanged(_ notification: Notification) {
      DispatchQueue.main.async {
      
          guard let downloadStateRawValue = notification.userInfo![Asset.Keys.downloadState] as? String,
                let downloadUrl = notification.userInfo![Asset.Keys.url] as? String,
                let downloadState = Asset.DownloadState(rawValue: downloadStateRawValue)
              else {
                  RCTLog("[Native Downloads] (DownloadsModule) Download state missing")
                  return
          }
                  
          switch downloadState {
              case .downloading:
                
                var downloadSelectionDisplayName:String
                  
                // Showing which media selection is being downloaded
                if let downloadSelection = notification.userInfo?[Asset.Keys.downloadSelectionDisplayName] as? String {
                  downloadSelectionDisplayName  = downloadSelection
                  RCTLog("[Native Downloads] (DownloadsModule) DOWNLOADING \(String(describing: downloadSelectionDisplayName))")
                  
                }
            
                self.sendEvent(withName: "onDownloadStateChanged", body: ["id":downloadUrl, "state": "DOWNLOADING"])
            
              case .downloadedAndSavedToDevice:
                RCTLog("[Native Downloads] (DownloadsModule) FINISHED DOWNLOADING")
            
            /*
                do {
                  try ContentKeyManager.sharedManager.requestApplicationCertificate()
                } catch {
                  
                }
            */
            
            
            /*
                if (ContentKeyManager.sharedManager.contentKeySession != nil && ContentKeyManager.sharedManager.contentKeyRequest != nil) {
                    NSLog("Trying to renew license")
                    ContentKeyManager.sharedManager.contentKeySession.renewExpiringResponseData(for: ContentKeyManager.sharedManager.contentKeyRequest)
                } else {
                    NSLog("Can't renew license, Content Key Session does not exist")
                }
            */
            
                self.sendEvent(withName: "onDownloadStateChanged", body: ["id":downloadUrl, "state": "COMPLETED"])
            
              case .notDownloaded:
                RCTLog("[Native Downloads] (DownloadsModule) ASSET NOT DOWNLOADED")
                self.sendEvent(withName: "onDownloadStateChanged", body: ["id":downloadUrl, "state": "NOT_DOWNLOADED"])
          
          }
          
      }
  }
  
  // Shows Download progress in %
  // [LOGGING]
  @objc func handleAssetDownloadProgress(_ notification: Notification) {
      guard let progress = notification.userInfo![Asset.Keys.percentDownloaded] as? Double,
            let assetName = notification.userInfo![Asset.Keys.name] as? String
      else { return }
              
      let humanReadableProgress = Double(round(1000 * progress) / 10)
      
      RCTLog("[Native Downloads] (DownloadsModule) DOWNLOADING PROGRESS of \(assetName) : \(humanReadableProgress)%")
      self.sendEvent(withName: "downloadProgress", body: ["id":assetName, "percent": humanReadableProgress] as [String : Any])
  }

}
