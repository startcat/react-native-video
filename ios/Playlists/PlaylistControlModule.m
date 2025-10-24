/*
 * PlaylistControlModule.m
 * 
 * Objective-C bridge para exponer PlaylistControlModule a React Native
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PlaylistControlModule, RCTEventEmitter)

// Set playlist with items and configuration
RCT_EXTERN_METHOD(setPlaylist:(NSArray *)items
                  config:(NSDictionary *)config)

// Navigate to specific index
RCT_EXTERN_METHOD(goToIndex:(NSInteger)index)

// Get current playlist item
RCT_EXTERN_METHOD(getCurrentPlaylistItem:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Get next playlist item
RCT_EXTERN_METHOD(getNextPlaylistItem:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Add single item to playlist
RCT_EXTERN_METHOD(addItem:(NSDictionary *)item)

// Remove item at specific index
RCT_EXTERN_METHOD(removeItemAt:(NSInteger)index)

// Set repeat mode (OFF, ALL, ONE)
RCT_EXTERN_METHOD(setRepeatMode:(NSString *)mode)

// Set shuffle mode (OFF, ON)
RCT_EXTERN_METHOD(setShuffleMode:(NSString *)mode)

// Set auto-next enabled/disabled
RCT_EXTERN_METHOD(setAutoNext:(BOOL)enabled)

// Playback control methods
RCT_EXTERN_METHOD(play:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pause:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(seekTo:(double)positionMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(next:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(previous:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPlaybackState:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Notify that item has started (coordinated mode)
RCT_EXTERN_METHOD(notifyItemStarted:(NSString *)itemId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Notify that item has finished (coordinated mode)
RCT_EXTERN_METHOD(notifyItemFinished:(NSString *)itemId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
