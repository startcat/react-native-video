/**
 * Android Auto Integration
 * 
 * Sistema opcional para integrar el reproductor de audio con Android Auto.
 * Permite navegación de biblioteca de medios y control de reproducción
 * desde la pantalla del vehículo.
 * 
 * **IMPORTANTE:** Solo disponible en Android.
 * 
 * ## Características
 * 
 * - ✅ Navegación de biblioteca de medios
 * - ✅ Búsqueda de contenido
 * - ✅ Control de reproducción
 * - ✅ Sincronización móvil ↔ Android Auto
 * - ✅ Funciona con pantalla móvil apagada
 * - ✅ Integración opcional (opt-in)
 * 
 * ## Uso Básico
 * 
 * ```typescript
 * import { AndroidAutoControl } from 'react-native-video';
 * 
 * // Habilitar Android Auto
 * await AndroidAutoControl.enable();
 * 
 * // Configurar biblioteca de medios
 * await AndroidAutoControl.setMediaLibrary([
 *     { id: 'podcast1', title: 'Mi Podcast', playable: true },
 *     { id: 'podcast2', title: 'Otro Podcast', playable: true }
 * ]);
 * 
 * // Manejar reproducción desde Android Auto
 * AndroidAutoControl.onPlayFromMediaId((mediaId) => {
 *     const item = findItemById(mediaId);
 *     loadContent(item);
 * });
 * ```
 * 
 * ## Uso con Hook
 * 
 * ```typescript
 * import { useAndroidAuto } from 'react-native-video';
 * 
 * function MyPlayer() {
 *     useAndroidAuto({
 *         enabled: true,
 *         library: myPodcasts,
 *         onPlayFromMediaId: (mediaId) => loadContent(mediaId)
 *     });
 *     
 *     return <AudioFlavour ... />;
 * }
 * ```
 * 
 * @see {@link AndroidAutoControl} - API principal
 * @see {@link useAndroidAuto} - Hook para integración con AudioFlavour
 * @see {@link types} - Tipos TypeScript
 * 
 * @module androidAuto
 */

// API Principal
export { AndroidAutoControl } from './AndroidAutoControl';

// Hook de integración
export { useAndroidAuto } from './useAndroidAuto';

// Tipos
export type { 
    MediaItem, 
    MediaMetadata, 
    AndroidAutoConfig,
    AndroidAutoConnectionStatus,
    BrowseCallback,
    PlayCallback,
    SearchCallback,
    BrowseRequestData,
    PlayRequestData,
    SearchRequestData
} from './types';

export { AndroidAutoEvent } from './types';
