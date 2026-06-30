import AVFoundation

// PLAYER-352 (Phase 3): FairPlay DRM (online streaming) was moved to the @overon DRM module
// (AVContentKeySession). This delegate now handles ONLY the non-DRM local-source-encryption-key
// scheme (embedded key delivery for locally-encrypted sources). All SPC/CKC/license logic and the
// JS `onGetLicense` callback path were removed from react-native-video.
class RCTResourceLoaderDelegate: NSObject, AVAssetResourceLoaderDelegate, URLSessionDelegate {
    private var _localSourceEncryptionKeyScheme: String?
    private var _reactTag: NSNumber?
    private var _onVideoError: RCTDirectEventBlock?

    init(
        asset: AVURLAsset,
        localSourceEncryptionKeyScheme: String?,
        onVideoError: RCTDirectEventBlock?,
        reactTag: NSNumber
    ) {
        super.init()
        let queue = DispatchQueue(label: "assetQueue")
        asset.resourceLoader.setDelegate(self, queue: queue)
        _reactTag = reactTag
        _onVideoError = onVideoError
        _localSourceEncryptionKeyScheme = localSourceEncryptionKeyScheme
    }

    func resourceLoader(_: AVAssetResourceLoader, shouldWaitForRenewalOfRequestedResource renewalRequest: AVAssetResourceRenewalRequest) -> Bool {
        return loadingRequestHandling(renewalRequest)
    }

    func resourceLoader(_: AVAssetResourceLoader, shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest) -> Bool {
        return loadingRequestHandling(loadingRequest)
    }

    func resourceLoader(_: AVAssetResourceLoader, didCancel _: AVAssetResourceLoadingRequest) {
        RCTLog("didCancelLoadingRequest")
    }

    func loadingRequestHandling(_ loadingRequest: AVAssetResourceLoadingRequest!) -> Bool {
        // Only the embedded-key (local source encryption) scheme is handled here. FairPlay DRM is
        // owned by the @overon DRM module's AVContentKeySession (PLAYER-352 Phase 3).
        return handleEmbeddedKey(loadingRequest)
    }

    func handleEmbeddedKey(_ loadingRequest: AVAssetResourceLoadingRequest!) -> Bool {
        guard let url = loadingRequest.request.url,
              let _localSourceEncryptionKeyScheme,
              let persistentKeyData = RCTVideoUtils.extractDataFromCustomSchemeUrl(from: url, scheme: _localSourceEncryptionKeyScheme)
        else {
            return false
        }

        loadingRequest.contentInformationRequest?.contentType = AVStreamingKeyDeliveryPersistentContentKeyType
        loadingRequest.contentInformationRequest?.isByteRangeAccessSupported = true
        loadingRequest.contentInformationRequest?.contentLength = Int64(persistentKeyData.count)
        loadingRequest.dataRequest?.respond(with: persistentKeyData)
        loadingRequest.finishLoading()

        return true
    }
}
