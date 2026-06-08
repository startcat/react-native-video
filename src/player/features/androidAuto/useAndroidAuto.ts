/**
 * useAndroidAuto - Hook para integrar Android Auto con AudioFlavour
 * 
 * Hook React que simplifica la integración de Android Auto con el reproductor.
 * Maneja automáticamente el ciclo de vida (enable/disable) y registra callbacks.
 * 
 * **Uso opcional** - No afecta la funcionalidad base del reproductor.
 * 
 * @example
 * ```typescript
 * function MyAudioPlayer() {
 *     const [currentSource, setCurrentSource] = useState(null);
 *     
 *     useAndroidAuto({
 *         enabled: true,
 *         library: myPodcasts,
 *         onPlayFromMediaId: (mediaId) => {
 *             const item = findItemById(mediaId);
 *             setCurrentSource(item);
 *         }
 *     });
 *     
 *     return <AudioFlavour source={currentSource} />;
 * }
 * ```
 */

import { useEffect, useRef } from 'react';
import { AndroidAutoControl } from './AndroidAutoControl';
import type { AndroidAutoConfig } from './types';

/**
 * Hook para integrar Android Auto con el reproductor
 * 
 * Características:
 * - Habilita/deshabilita Android Auto automáticamente
 * - Registra callbacks de navegación y reproducción
 * - Actualiza biblioteca cuando cambia
 * - Limpia recursos al desmontar
 * 
 * @param config Configuración de Android Auto (opcional)
 * 
 * @example
 * ```typescript
 * // Uso básico
 * useAndroidAuto({
 *     enabled: true,
 *     library: podcasts
 * });
 * 
 * // Con callbacks
 * useAndroidAuto({
 *     enabled: true,
 *     library: podcasts,
 *     onBrowseRequest: (parentId) => {
 *         return getDynamicContent(parentId);
 *     },
 *     onPlayFromMediaId: (mediaId) => {
 *         loadContent(mediaId);
 *     },
 *     onSearch: (query) => {
 *         return searchContent(query);
 *     }
 * });
 * 
 * // Deshabilitar
 * useAndroidAuto({
 *     enabled: false
 * });
 * ```
 */
export function useAndroidAuto(config?: AndroidAutoConfig): void {
    
    // Refs para callbacks (evitar recreación en cada render)
    const browseCallbackRef = useRef(config?.onBrowseRequest);
    const playCallbackRef = useRef(config?.onPlayFromMediaId);
    const searchCallbackRef = useRef(config?.onSearch);
    
    // Actualizar refs cuando cambien los callbacks
    useEffect(() => {
        browseCallbackRef.current = config?.onBrowseRequest;
    }, [config?.onBrowseRequest]);
    
    useEffect(() => {
        playCallbackRef.current = config?.onPlayFromMediaId;
    }, [config?.onPlayFromMediaId]);
    
    useEffect(() => {
        searchCallbackRef.current = config?.onSearch;
    }, [config?.onSearch]);
    
    // Efecto principal: Habilitar/deshabilitar Android Auto
    useEffect(() => {
        // Si no está habilitado, no hacer nada
        if (!config?.enabled) {
            return;
        }
        
        let unsubscribeBrowse: (() => void) | undefined;
        let unsubscribePlay: (() => void) | undefined;
        let unsubscribeSearch: (() => void) | undefined;
        
        const setup = async () => {
            try {
                console.log('[useAndroidAuto] Setting up Android Auto...');
                
                // 1. Habilitar Android Auto
                await AndroidAutoControl.enable();
                console.log('[useAndroidAuto] Android Auto enabled');
                
                // 2. Configurar biblioteca si se proporciona
                if (config.library && config.library.length > 0) {
                    await AndroidAutoControl.setMediaLibrary(config.library);
                    console.log(`[useAndroidAuto] Library set with ${config.library.length} items`);
                }
                
                // 3. Registrar callback de navegación
                if (browseCallbackRef.current) {
                    unsubscribeBrowse = AndroidAutoControl.onBrowseRequest(
                        (parentId) => {
                            if (browseCallbackRef.current) {
                                return browseCallbackRef.current(parentId);
                            }
                            return [];
                        }
                    );
                    console.log('[useAndroidAuto] Browse callback registered');
                }
                
                // 4. Registrar callback de reproducción
                if (playCallbackRef.current) {
                    unsubscribePlay = AndroidAutoControl.onPlayFromMediaId(
                        (mediaId) => {
                            if (playCallbackRef.current) {
                                playCallbackRef.current(mediaId);
                            }
                        }
                    );
                    console.log('[useAndroidAuto] Play callback registered');
                }
                
                // 5. Registrar callback de búsqueda
                if (searchCallbackRef.current) {
                    unsubscribeSearch = AndroidAutoControl.onSearch(
                        (query) => {
                            if (searchCallbackRef.current) {
                                return searchCallbackRef.current(query);
                            }
                            return [];
                        }
                    );
                    console.log('[useAndroidAuto] Search callback registered');
                }
                
                // 6. Marcar JavaScript como listo
                await AndroidAutoControl.setJavaScriptReady();
                
                console.log('[useAndroidAuto] Setup complete');
                
            } catch (error) {
                console.error('[useAndroidAuto] Setup failed:', error);
            }
        };
        
        // Ejecutar setup
        setup();
        
        // Cleanup al desmontar o cuando enabled cambia a false
        return () => {
            console.log('[useAndroidAuto] Cleaning up...');
            
            // Desregistrar callbacks
            unsubscribeBrowse?.();
            unsubscribePlay?.();
            unsubscribeSearch?.();
            
            // Nota: No llamamos disable() aquí porque puede haber
            // múltiples componentes usando el hook. El disable()
            // debe ser explícito por parte de la app.
            
            console.log('[useAndroidAuto] Cleanup complete');
        };
        
    }, [config?.enabled]); // Solo re-ejecutar si enabled cambia
    
    // Efecto: Actualizar biblioteca cuando cambia
    useEffect(() => {
        if (!config?.enabled || !config?.library) {
            return;
        }
        
        const updateLibrary = async () => {
            try {
                await AndroidAutoControl.setMediaLibrary(config.library!);
                console.log(`[useAndroidAuto] Library updated with ${config.library!.length} items`);
            } catch (error) {
                console.error('[useAndroidAuto] Failed to update library:', error);
            }
        };
        
        updateLibrary();
        
    }, [config?.enabled, config?.library]);
    
    // Efecto: Actualizar metadata automáticamente (si está habilitado)
    // Nota: Este efecto se puede extender en el futuro para sincronizar
    // automáticamente con el estado del reproductor
    useEffect(() => {
        if (!config?.enabled) {
            return;
        }
        
        // TODO: Implementar sincronización automática de metadata
        // cuando el reproductor cambie de contenido
        
        const autoUpdateMetadata = config.autoUpdateMetadata ?? true;
        
        if (autoUpdateMetadata) {
            console.log('[useAndroidAuto] Auto-update metadata enabled');
            // Aquí se podría escuchar eventos del reproductor
            // y actualizar AndroidAutoControl.updateNowPlaying()
        }
        
    }, [config?.enabled, config?.autoUpdateMetadata]);
}

/**
 * Hook simplificado para casos básicos
 * 
 * Versión simplificada que solo requiere habilitar/deshabilitar
 * y una biblioteca estática.
 * 
 * @param enabled Si Android Auto está habilitado
 * @param library Biblioteca de medios
 * @param onPlayFromMediaId Callback de reproducción
 * 
 * @example
 * ```typescript
 * useAndroidAutoSimple(
 *     true,
 *     myPodcasts,
 *     (mediaId) => loadContent(mediaId)
 * );
 * ```
 */
export function useAndroidAutoSimple(
    enabled: boolean,
    library: AndroidAutoConfig['library'],
    onPlayFromMediaId?: AndroidAutoConfig['onPlayFromMediaId']
): void {
    useAndroidAuto({
        enabled,
        library,
        onPlayFromMediaId
    });
}
