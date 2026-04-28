#if RNUSE_GOOGLE_IMA
    import CoreMedia
    import Foundation
    import GoogleInteractiveMediaAds

    class RCTIMAAdsManager: NSObject, IMAAdsLoaderDelegate, IMAAdsManagerDelegate, IMALinkOpenerDelegate {
        private weak var _video: RCTVideo?
        private var _pipEnabled: () -> Bool

        /* Entry point for the SDK. Used to make ad requests. */
        private var adsLoader: IMAAdsLoader!
        /* Main point of interaction with the SDK. Created by the SDK as the result of an ad request. */
        private var adsManager: IMAAdsManager!

        /* Synthetic AD_PROGRESS support for iOS. The IMA iOS SDK does not
         * publish AD_PROGRESS events the way Android does, and the content
         * AVPlayer's `currentTime()` is paused at the pre-ad position during
         * ad playback (it is the CONTENT player, not the ad player). To keep
         * the JS state machine ticking ~1Hz parity with Android we capture
         * the wall-clock start of each STARTED event and fire synthetic
         * AD_PROGRESS events from a Timer until COMPLETE / SKIPPED.
         */
        private var currentAd: IMAAd?
        private var adStartDate: Date?
        private var progressTimer: Timer?

        init(video: RCTVideo!, pipEnabled: @escaping () -> Bool) {
            _video = video
            _pipEnabled = pipEnabled

            super.init()
        }

        func setUpAdsLoader() {
            adsLoader = IMAAdsLoader(settings: nil)
            adsLoader.delegate = self
        }

        func requestAds() {
            guard let _video else { return }
            // Create ad display container for ad rendering.
            let adDisplayContainer = IMAAdDisplayContainer(adContainer: _video, viewController: _video.reactViewController())

            let adTagUrl = _video.getAdTagUrl()
            let contentPlayhead = _video.getContentPlayhead()

            if adTagUrl != nil && contentPlayhead != nil {
                // Create an ad request with our ad tag, display container, and optional user context.
                let request = IMAAdsRequest(
                    adTagUrl: adTagUrl!,
                    adDisplayContainer: adDisplayContainer,
                    contentPlayhead: contentPlayhead,
                    userContext: nil
                )

                adsLoader.requestAds(with: request)
            }
        }

        func releaseAds() {
            stopAdProgressTimer()
            guard let adsManager else { return }
            // Destroy AdsManager may be delayed for a few milliseconds
            // But what we want is it stopped producing sound immediately
            // Issue found on tvOS 17, or iOS if view detach & STARTED event happen at the same moment
            adsManager.volume = 0
            adsManager.pause()
            adsManager.destroy()
        }

        func skip() {
            guard let adsManager else { return }
            adsManager.skip()
        }

        // MARK: - Synthetic AD_PROGRESS (iOS-only)

        private func startAdProgressTimer(for ad: IMAAd) {
            stopAdProgressTimer()
            currentAd = ad
            adStartDate = Date()
            progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                self?.fireSyntheticAdProgress()
            }
        }

        private func stopAdProgressTimer() {
            progressTimer?.invalidate()
            progressTimer = nil
            currentAd = nil
            adStartDate = nil
        }

        private func fireSyntheticAdProgress() {
            guard let video = _video,
                  let onReceiveAdEvent = video.onReceiveAdEvent,
                  let ad = currentAd,
                  let startDate = adStartDate
            else { return }

            let elapsed = Date().timeIntervalSince(startDate)
            let clamped = max(0, min(elapsed, ad.duration))

            var data: [String: Any] = [
                "currentTime": clamped,
                "duration": ad.duration,
                "isSkippable": ad.isSkippable,
                "skipOffset": ad.skipTimeOffset,
                "adPosition": ad.adPodInfo.adPosition,
                "totalAds": ad.adPodInfo.totalAds,
            ]
            if !ad.adTitle.isEmpty {
                data["adTitle"] = ad.adTitle
            }

            onReceiveAdEvent([
                "event": "AD_PROGRESS",
                "data": data,
                "target": video.reactTag!,
            ])
        }

        // MARK: - Getters

        func getAdsLoader() -> IMAAdsLoader? {
            return adsLoader
        }

        func getAdsManager() -> IMAAdsManager? {
            return adsManager
        }

        // MARK: - IMAAdsLoaderDelegate

        func adsLoader(_: IMAAdsLoader, adsLoadedWith adsLoadedData: IMAAdsLoadedData) {
            guard let _video else { return }
            // Grab the instance of the IMAAdsManager and set yourself as the delegate.
            adsManager = adsLoadedData.adsManager
            adsManager?.delegate = self

            // Create ads rendering settings and tell the SDK to use the in-app browser.
            let adsRenderingSettings = IMAAdsRenderingSettings()
            adsRenderingSettings.linkOpenerDelegate = self
            adsRenderingSettings.linkOpenerPresentingController = _video.reactViewController()

            adsManager.initialize(with: adsRenderingSettings)
        }

        func adsLoader(_: IMAAdsLoader, failedWith adErrorData: IMAAdLoadingErrorData) {
            if adErrorData.adError.message != nil {
                print("Error loading ads: " + adErrorData.adError.message!)
            }

            _video?.setPaused(false)
        }

        // MARK: - IMAAdsManagerDelegate

        func adsManager(_ adsManager: IMAAdsManager, didReceive event: IMAAdEvent) {
            guard let _video else { return }
            // Mute ad if the main player is muted
            if _video.isMuted() {
                adsManager.volume = 0
            }
            // Play each ad once it has been loaded
            if event.type == IMAAdEventType.LOADED {
                if _pipEnabled() {
                    return
                }
                adsManager.start()
            }

            // Drive the synthetic AD_PROGRESS timer for iOS (the IMA iOS SDK
            // does not publish AD_PROGRESS events natively, and the content
            // AVPlayer is paused during ad playback, so we have to compute
            // ad-elapsed time from wall clock).
            switch event.type {
            case .STARTED:
                if let ad = event.ad {
                    startAdProgressTimer(for: ad)
                }
            case .COMPLETE, .SKIPPED, .ALL_ADS_COMPLETED:
                stopAdProgressTimer()
            default:
                break
            }

            if _video.onReceiveAdEvent != nil {
                let type = convertEventToString(event: event.type)
                var data: [String: Any] = [:]

                // Pass through whatever the SDK already gave us. event.adData
                // is bridged as [String: Any] so the keys are already String.
                if let adData = event.adData {
                    for (key, value) in adData {
                        data[key] = value
                    }
                }

                // Enrich with creative metadata. Mirror of the Android fix in
                // ReactExoplayerView.onAdEvent (commit fe561a77).
                // Note: on iOS, IMAAd's metadata fields are non-optional value
                // types (String / Double / Bool), unlike the Android nullable
                // accessors. Empty strings are treated as "no title".
                if let ad = event.ad {
                    if data["adTitle"] == nil, !ad.adTitle.isEmpty {
                        data["adTitle"] = ad.adTitle
                    }
                    if data["duration"] == nil {
                        data["duration"] = ad.duration
                    }
                    if data["isSkippable"] == nil {
                        data["isSkippable"] = ad.isSkippable
                    }
                    if data["skipOffset"] == nil {
                        data["skipOffset"] = ad.skipTimeOffset
                    }
                    let pod = ad.adPodInfo
                    if data["adPosition"] == nil {
                        data["adPosition"] = pod.adPosition
                    }
                    if data["totalAds"] == nil {
                        data["totalAds"] = pod.totalAds
                    }
                }

                // NOTE: We intentionally do NOT inject `_video.getPlayer().currentTime()`
                // for quartile / lifecycle events here. On iOS the content
                // AVPlayer is paused during ad playback, so its `currentTime()`
                // is the pre-ad CONTENT position — not the ad's elapsed time.
                // Synthetic AD_PROGRESS events emitted by `progressTimer`
                // provide accurate ad-elapsed time at 1Hz instead.

                if data.isEmpty {
                    _video.onReceiveAdEvent?([
                        "event": type,
                        "target": _video.reactTag!,
                    ])
                } else {
                    _video.onReceiveAdEvent?([
                        "event": type,
                        "data": data,
                        "target": _video.reactTag!,
                    ])
                }
            }
        }

        func adsManager(_: IMAAdsManager, didReceive error: IMAAdError) {
            if error.message != nil {
                print("AdsManager error: " + error.message!)
            }

            guard let _video else { return }

            if _video.onReceiveAdEvent != nil {
                _video.onReceiveAdEvent?([
                    "event": "ERROR",
                    "data": [
                        "message": error.message ?? "",
                        "code": error.code,
                        "type": error.type,
                    ],
                    "target": _video.reactTag!,
                ])
            }

            // Fall back to playing content
            _video.setPaused(false)
        }

        func adsManagerDidRequestContentPause(_: IMAAdsManager) {
            // Pause the content for the SDK to play ads.
            _video?.setPaused(true)
            _video?.setAdPlaying(true)
        }

        func adsManagerDidRequestContentResume(_: IMAAdsManager) {
            // Resume the content since the SDK is done playing ads (at least for now).
            _video?.setAdPlaying(false)
            _video?.setPaused(false)
        }

        // MARK: - IMALinkOpenerDelegate

        func linkOpenerDidClose(inAppLink _: NSObject) {
            adsManager?.resume()
        }

        // MARK: - Helpers

        func convertEventToString(event: IMAAdEventType!) -> String {
            var result = "UNKNOWN"

            switch event {
            case .AD_BREAK_READY:
                result = "AD_BREAK_READY"
            case .AD_BREAK_ENDED:
                result = "AD_BREAK_ENDED"
            case .AD_BREAK_STARTED:
                result = "AD_BREAK_STARTED"
            case .AD_PERIOD_ENDED:
                result = "AD_PERIOD_ENDED"
            case .AD_PERIOD_STARTED:
                result = "AD_PERIOD_STARTED"
            case .ALL_ADS_COMPLETED:
                result = "ALL_ADS_COMPLETED"
            case .CLICKED:
                result = "CLICK"
            case .COMPLETE:
                result = "COMPLETED"
            case .CUEPOINTS_CHANGED:
                result = "CUEPOINTS_CHANGED"
            case .FIRST_QUARTILE:
                result = "FIRST_QUARTILE"
            case .LOADED:
                result = "LOADED"
            case .LOG:
                result = "LOG"
            case .MIDPOINT:
                result = "MIDPOINT"
            case .PAUSE:
                result = "PAUSED"
            case .RESUME:
                result = "RESUMED"
            case .SKIPPED:
                result = "SKIPPED"
            case .STARTED:
                result = "STARTED"
            case .STREAM_LOADED:
                result = "STREAM_LOADED"
            case .TAPPED:
                result = "TAPPED"
            case .THIRD_QUARTILE:
                result = "THIRD_QUARTILE"
            default:
                result = "UNKNOWN"
            }

            return result
        }
    }
#endif
