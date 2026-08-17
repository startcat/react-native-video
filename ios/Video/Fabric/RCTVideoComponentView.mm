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

#import <React/RCTViewComponentView.h>
#import <folly/dynamic.h>
#import <react/renderer/componentregistry/ComponentDescriptorProvider.h>
#import <react/renderer/components/view/ConcreteViewShadowNode.h>
#import <react/renderer/core/ConcreteComponentDescriptor.h>
#import <react/renderer/core/DynamicPropsUtilities.h>
#import <react/renderer/core/PropsParserContext.h>

// Conversores locales NSObject <-> folly::dynamic. RN los trae en
// react/utils/FollyConvert.h, pero ese header no está en los search paths de
// todos los setups de pods de las apps, así que no dependemos de él.
static folly::dynamic RNVDynamicFromId(id value)
{
  if (value == nil || value == (id)kCFNull) {
    return nullptr;
  }
  if ([value isKindOfClass:[NSNumber class]]) {
    NSNumber *number = value;
    if (number == (id)kCFBooleanTrue || number == (id)kCFBooleanFalse) {
      return static_cast<bool>(number.boolValue);
    }
    const char *type = number.objCType;
    if (strcmp(type, @encode(BOOL)) == 0 || strcmp(type, @encode(char)) == 0) {
      return static_cast<bool>(number.boolValue);
    }
    if (strcmp(type, @encode(double)) == 0 || strcmp(type, @encode(float)) == 0) {
      return number.doubleValue;
    }
    return static_cast<int64_t>(number.longLongValue);
  }
  if ([value isKindOfClass:[NSString class]]) {
    return folly::dynamic([(NSString *)value UTF8String] ?: "");
  }
  if ([value isKindOfClass:[NSArray class]]) {
    folly::dynamic result = folly::dynamic::array();
    for (id item in (NSArray *)value) {
      result.push_back(RNVDynamicFromId(item));
    }
    return result;
  }
  if ([value isKindOfClass:[NSDictionary class]]) {
    folly::dynamic result = folly::dynamic::object();
    for (id key in (NSDictionary *)value) {
      if ([key isKindOfClass:[NSString class]]) {
        result[[(NSString *)key UTF8String]] = RNVDynamicFromId(((NSDictionary *)value)[key]);
      }
    }
    return result;
  }
  return nullptr;
}

static id RNVIdFromDynamic(const folly::dynamic &dyn)
{
  switch (dyn.type()) {
    case folly::dynamic::NULLT:
      return nil;
    case folly::dynamic::BOOL:
      return dyn.getBool() ? @YES : @NO;
    case folly::dynamic::INT64:
      return @(dyn.getInt());
    case folly::dynamic::DOUBLE:
      return @(dyn.getDouble());
    case folly::dynamic::STRING:
      return [NSString stringWithUTF8String:dyn.getString().c_str()] ?: @"";
    case folly::dynamic::ARRAY: {
      NSMutableArray *array = [NSMutableArray arrayWithCapacity:dyn.size()];
      for (const auto &item : dyn) {
        id converted = RNVIdFromDynamic(item);
        [array addObject:converted ?: [NSNull null]];
      }
      return array;
    }
    case folly::dynamic::OBJECT: {
      NSMutableDictionary *dict = [NSMutableDictionary dictionaryWithCapacity:dyn.size()];
      for (const auto &pair : dyn.items()) {
        if (!pair.first.isString()) {
          continue;
        }
        NSString *key = [NSString stringWithUTF8String:pair.first.getString().c_str()];
        id converted = RNVIdFromDynamic(pair.second);
        if (key != nil) {
          dict[key] = converted ?: [NSNull null];
        }
      }
      return dict;
    }
  }
  return nil;
}

namespace facebook::react {

// OJO: el JS declara el componente como "RCTVideo", pero en iOS TODA búsqueda
// de Fabric pasa por componentNameByReactViewName(), que recorta el prefijo
// "RCT" (ComponentDescriptorRegistry::at y el binding hasComponentProvider).
// El nombre efectivo del descriptor en iOS es por tanto "Video", y la clave
// del componentProvider en package.json debe serlo también. Con "RCTVideo"
// aquí, el registro nunca matchea y la vista cae por la interop legacy
// (rota en bridgeless): exactamente el bug de PLAYER-473.
extern const char RNVideoComponentName[];
const char RNVideoComponentName[] = "Video";

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
    NSLog(@"RNVFABRIC componentview init");
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
  NSLog(@"RNVFABRIC makeVideoView ok=%d shim=%d", _videoView != nil, shim != nil);

  __weak RCTVideoComponentView *weakSelf = self;
  [shim wireEvents:_videoView
           handler:^(NSString *eventName, NSDictionary *_Nullable body) {
             RCTVideoComponentView *strongSelf = weakSelf;
             if (strongSelf == nil) {
               return;
             }
             auto eventEmitter = strongSelf->_eventEmitter;
             if (!eventEmitter) {
               NSLog(@"RNVEVT dropped no emitter %@", eventName);
               return;
             }
             // Diagnostico temporal PLAYER-473 (retirar antes de la MR):
             // los eventos de alta frecuencia se omiten del log.
             if (![eventName isEqualToString:@"videoProgress"] &&
                 ![eventName isEqualToString:@"videoPlaybackMetrics"] &&
                 ![eventName isEqualToString:@"videoBandwidthUpdate"]) {
               NSLog(@"RNVEVT %@", eventName);
             }
             eventEmitter->dispatchEvent(
                 std::string([eventName UTF8String]),
                 RNVDynamicFromId(body ?: @{}));
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
    id value = RNVIdFromDynamic(pair.second);
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
