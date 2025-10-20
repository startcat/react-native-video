#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VideoSleepTimerModule, NSObject)

RCT_EXTERN_METHOD(activateSleepTimer:(nonnull NSNumber *)seconds)

RCT_EXTERN_METHOD(activateFinishCurrentTimer)

RCT_EXTERN_METHOD(cancelSleepTimer)

RCT_EXTERN_METHOD(getSleepTimerStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(notifyMediaEnded)

@end
