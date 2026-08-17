// Componente Fabric de <Video> para iOS (PLAYER-473).
//
// Estrategia: en lugar del struct de Props tipado que genera el codegen, el
// descriptor usa una clase de Props que conserva los rawProps como
// folly::dynamic (mismo patrón que LegacyViewManagerInteropViewProps). El
// diccionario viaja a RNVideoFabricShim (Swift), que despacha al setter tipado
// de RCTVideo — el mismo modelo de aplicación de props que Paper, así que
// añadir una prop nueva solo requiere tocar el spec y el shim, no este fichero.
//
// Los eventos salen por EventEmitter::dispatchEvent genérico con el mismo
// nombre que emitiría el emitter generado (prop "onVideoLoad" → "videoLoad");
// normalizeEventType lo convierte en "topVideoLoad", que es lo que espera el
// view config estático generado a partir del spec.
//
// El codegen JS/registro sigue activo: el spec declara el componente y
// codegenConfig.ios.componentProvider mapea "RCTVideo" → esta clase en el
// RCTThirdPartyComponentsProvider generado por la app.

#ifdef RCT_NEW_ARCH_ENABLED

#import <UIKit/UIKit.h>

#import <react/utils/FollyConvert.h>
#import <React/RCTViewComponentView.h>
#import <folly/dynamic.h>
#import <react/renderer/componentregistry/ComponentDescriptorProvider.h>
#import <react/renderer/components/view/ConcreteViewShadowNode.h>
#import <react/renderer/core/ConcreteComponentDescriptor.h>
#import <react/renderer/core/DynamicPropsUtilities.h>
#import <react/renderer/core/PropsParserContext.h>

namespace facebook::react {

extern const char RNVideoComponentName[];
const char RNVideoComponentName[] = "RCTVideo";

class RNVideoProps final : public ViewProps {
 public:
  RNVideoProps() = default;
  RNVideoProps(
      const PropsParserContext &context,
      const RNVideoProps &sourceProps,
      const RawProps &rawProps)
      : ViewProps(context, sourceProps, rawProps),
        // rawProps solo trae el delta de esta actualización; hay que fusionar
        // con lo acumulado para que updateProps pueda comparar estados completos.
        otherProps(mergeDynamicProps(
            sourceProps.otherProps,
            (folly::dynamic)rawProps,
            NullValueStrategy::Override)) {}

  folly::dynamic otherProps{folly::dynamic::object()};
};

using RNVideoShadowNode =
    ConcreteViewShadowNode<RNVideoComponentName, RNVideoProps>;
using RNVideoComponentDescriptor = ConcreteComponentDescriptor<RNVideoShadowNode>;

} // namespace facebook::react

using namespace facebook::react;

// Interfaz del shim Swift (RNVideoFabricShim.swift). Se resuelve por nombre en
// runtime para no depender del header generado `-Swift.h` del pod.
@protocol RNVideoFabricShimInterface <NSObject>
+ (UIView *)makeVideoView;
+ (void)applyProps:(NSDictionary<NSString *, id> *)props to:(UIView *)view;
+ (void)wireEvents:(UIView *)view
           handler:(void (^)(NSString *eventName, NSDictionary *_Nullable body))handler;
+ (void)registerVideoView:(UIView *)view forTag:(NSInteger)tag;
+ (void)unregisterTag:(NSInteger)tag;
+ (void)tearDownVideoView:(UIView *)view;
@end

static Class<RNVideoFabricShimInterface> RNVideoFabricShimClass(void)
{
  static Class shimClass;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    shimClass = NSClassFromString(@"RNVideoFabricShim");
    NSCAssert(shimClass != nil, @"RNVideoFabricShim no está enlazado en el binario");
  });
  return (Class<RNVideoFabricShimInterface>)shimClass;
}

@interface RCTVideoComponentView : RCTViewComponentView
@end

@implementation RCTVideoComponentView {
  UIView *_videoView; // instancia RCTVideo (Swift), opaca desde aquí
  NSInteger _registeredTag;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<RNVideoComponentDescriptor>();
}

// Un AVPlayer con estado de reproducción no es reciclable con seguridad.
+ (BOOL)shouldBeRecycled
{
  return NO;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const RNVideoProps>();
    _props = defaultProps;
    _registeredTag = 0;
  }
  return self;
}

- (void)ensureVideoView
{
  if (_videoView != nil) {
    return;
  }
  Class<RNVideoFabricShimInterface> shim = RNVideoFabricShimClass();
  _videoView = [shim makeVideoView];

  __weak RCTVideoComponentView *weakSelf = self;
  [shim wireEvents:_videoView
           handler:^(NSString *eventName, NSDictionary *_Nullable body) {
             RCTVideoComponentView *strongSelf = weakSelf;
             if (strongSelf == nil) {
               return;
             }
             auto eventEmitter = strongSelf->_eventEmitter;
             if (!eventEmitter) {
               return;
             }
             eventEmitter->dispatchEvent(
                 std::string([eventName UTF8String]),
                 convertIdToFollyDynamic(body ?: @{}));
           }];

  self.contentView = _videoView;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  [self ensureVideoView];

  static const auto defaultProps = std::make_shared<const RNVideoProps>();
  const auto &newVideoProps = *std::static_pointer_cast<const RNVideoProps>(props);
  const auto &oldVideoProps =
      *(oldProps ? std::static_pointer_cast<const RNVideoProps>(oldProps) : defaultProps);

  NSMutableDictionary<NSString *, id> *changed = [NSMutableDictionary new];
  for (const auto &pair : newVideoProps.otherProps.items()) {
    if (!pair.first.isString()) {
      continue;
    }
    const std::string &name = pair.first.getString();
    // Los handlers de evento no son props de la vista.
    if (name.size() > 2 && name[0] == 'o' && name[1] == 'n' && isupper(name[2])) {
      continue;
    }
    const folly::dynamic *oldValue = oldVideoProps.otherProps.get_ptr(name);
    if (oldValue != nullptr && *oldValue == pair.second) {
      continue;
    }
    NSString *key = [NSString stringWithUTF8String:name.c_str()];
    id value = convertFollyDynamicToId(pair.second);
    changed[key] = value ?: [NSNull null];
  }

  if (changed.count > 0) {
    [RNVideoFabricShimClass() applyProps:changed to:_videoView];
  }

  [super updateProps:props oldProps:oldProps];

  // El tag ya está asignado durante el montaje; registrar para que
  // RCTVideoManager (save/seek/pause/volume por reactTag) encuentre la vista.
  if (self.tag != _registeredTag) {
    if (_registeredTag != 0) {
      [RNVideoFabricShimClass() unregisterTag:_registeredTag];
    }
    _registeredTag = self.tag;
    [RNVideoFabricShimClass() registerVideoView:_videoView forTag:_registeredTag];
  }
}

- (void)prepareForRecycle
{
  [self tearDown];
  [super prepareForRecycle];
}

- (void)dealloc
{
  [self tearDown];
}

// El teardown completo de RCTVideo (player, AVPlayerViewController como child
// VC, observers) vive en su removeFromSuperview; deinit solo cubre parte. Sin
// esta llamada explícita el AVPlayerViewController retenido por el VC padre
// mantiene vivo el AVPlayer tras el unmount (audio fantasma).
- (void)tearDown
{
  if (_registeredTag != 0) {
    [RNVideoFabricShimClass() unregisterTag:_registeredTag];
    _registeredTag = 0;
  }
  if (_videoView != nil) {
    [RNVideoFabricShimClass() tearDownVideoView:_videoView];
    _videoView = nil;
    self.contentView = nil;
  }
}

@end

#endif // RCT_NEW_ARCH_ENABLED
