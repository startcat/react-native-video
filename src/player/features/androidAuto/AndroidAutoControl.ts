/**
 * AndroidAutoControl - API principal para integración con Android Auto
 * 
 * Proporciona una interfaz limpia y tipada para controlar Android Auto
 * desde JavaScript. Actúa como wrapper del módulo nativo AndroidAutoModule.
 * 
 * @example
 * ```typescript
 * // Habilitar Android Auto
 * await AndroidAutoControl.enable();
 * 
 * // Configurar biblioteca
 * await AndroidAutoControl.setMediaLibrary([
 *     { id: 'podcast1', title: 'Mi Podcast', playable: true }
 * ]);
 * 
 * // Escuchar eventos de reproducción
 * const unsubscribe = AndroidAutoControl.onPlayFromMediaId((mediaId) => {
 *     console.log('Play requested:', mediaId);
 *     loadContent(mediaId);
 * });
 * ```
 */

import { NativeModules, DeviceEventEmitter, Platform, NativeEventEmitter } from 'react-native';
import type { 
    MediaItem, 
    MediaMetadata, 
    BrowseCallback, 
    PlayCallback,
    SearchCallback,
    AndroidAutoConnectionStatus,
    BrowseRequestData,
    PlayRequestData,
    SearchRequestData
} from './types';
import { AndroidAutoEvent } from './types';

// Obtener módulo nativo
const { AndroidAutoModule } = NativeModules;

/**
 * Clase principal para controlar Android Auto
 * 
 * Singleton que gestiona la comunicación con el módulo nativo
 * y proporciona API para apps.
 */
export class AndroidAutoControl {
    
    // Estado interno
    private static enabled = false;
    private static initialized = false;
    
    // Callbacks registrados
    private static browseCallbacks = new Map<string, BrowseCallback>();
    private static playCallback: PlayCallback | null = null;
    private static searchCallback: SearchCallback | null = null;
    
    // Event emitter para eventos nativos
    private static eventEmitter: NativeEventEmitter | null = null;
    
    // Subscripciones activas
    private static subscriptions: any[] = [];
    
    /**
     * Verificar disponibilidad del módulo
     * 
     * @throws Error si el módulo nativo no está disponible
     */
    private static checkAvailability(): void {
        if (Platform.OS !== 'android') {
            throw new Error('[AndroidAuto] Only available on Android platform');
        }
        
        if (!AndroidAutoModule) {
            throw new Error('[AndroidAuto] Native module not found. Make sure the package is properly linked.');
        }
    }
    
    /**
     * Inicializar sistema de eventos
     */
    private static initializeEventSystem(): void {
        if (this.initialized) return;
        
        this.checkAvailability();
        
        // Configurar event emitter
        if (AndroidAutoModule) {
            this.eventEmitter = new NativeEventEmitter(AndroidAutoModule);
        }
        
        // Registrar listeners de eventos nativos
        this.setupEventListeners();
        
        this.initialized = true;
        console.log('[AndroidAuto] Event system initialized');
    }
    
    /**
     * Configurar listeners de eventos nativos
     */
    private static setupEventListeners(): void {
        // Evento: Solicitud de navegación
        const browseSub = DeviceEventEmitter.addListener(
            AndroidAutoEvent.BROWSE_REQUEST,
            (data: BrowseRequestData) => {
                console.log('[AndroidAuto] Browse request:', data.parentId);
                this.handleBrowseRequest(data);
            }
        );
        this.subscriptions.push(browseSub);
        
        // Evento: Solicitud de reproducción
        const playSub = DeviceEventEmitter.addListener(
            AndroidAutoEvent.PLAY_FROM_MEDIA_ID,
            (data: PlayRequestData) => {
                console.log('[AndroidAuto] Play request:', data.mediaId);
                this.handlePlayRequest(data);
            }
        );
        this.subscriptions.push(playSub);
        
        // Evento: Solicitud de búsqueda
        const searchSub = DeviceEventEmitter.addListener(
            AndroidAutoEvent.SEARCH_REQUEST,
            (data: SearchRequestData) => {
                console.log('[AndroidAuto] Search request:', data.query);
                this.handleSearchRequest(data);
            }
        );
        this.subscriptions.push(searchSub);
        
        // Evento: Android Auto conectado
        const connectedSub = DeviceEventEmitter.addListener(
            AndroidAutoEvent.CONNECTED,
            () => {
                console.log('[AndroidAuto] Connected');
            }
        );
        this.subscriptions.push(connectedSub);
        
        // Evento: Android Auto desconectado
        const disconnectedSub = DeviceEventEmitter.addListener(
            AndroidAutoEvent.DISCONNECTED,
            () => {
                console.log('[AndroidAuto] Disconnected');
            }
        );
        this.subscriptions.push(disconnectedSub);
    }
    
    /**
     * Limpiar listeners de eventos
     */
    private static cleanupEventListeners(): void {
        this.subscriptions.forEach(sub => {
            if (sub && typeof sub.remove === 'function') {
                sub.remove();
            }
        });
        this.subscriptions = [];
        console.log('[AndroidAuto] Event listeners cleaned up');
    }
    
    /**
     * Manejar solicitud de navegación
     */
    private static handleBrowseRequest(data: BrowseRequestData): void {
        // Ejecutar todos los callbacks registrados
        this.browseCallbacks.forEach(async (callback, id) => {
            try {
                const items = await callback(data.parentId);
                console.log(`[AndroidAuto] Browse callback ${id} returned ${items.length} items`);
                // TODO FASE 6: Enviar respuesta al servicio nativo
            } catch (error) {
                console.error(`[AndroidAuto] Browse callback ${id} failed:`, error);
            }
        });
    }
    
    /**
     * Manejar solicitud de reproducción
     */
    private static handlePlayRequest(data: PlayRequestData): void {
        if (this.playCallback) {
            try {
                this.playCallback(data.mediaId);
                console.log('[AndroidAuto] Play callback executed');
            } catch (error) {
                console.error('[AndroidAuto] Play callback failed:', error);
            }
        } else {
            console.warn('[AndroidAuto] Play request received but no callback registered');
        }
    }
    
    /**
     * Manejar solicitud de búsqueda
     */
    private static handleSearchRequest(data: SearchRequestData): void {
        if (this.searchCallback) {
            try {
                this.searchCallback(data.query);
                console.log('[AndroidAuto] Search callback executed');
            } catch (error) {
                console.error('[AndroidAuto] Search callback failed:', error);
            }
        } else {
            console.warn('[AndroidAuto] Search request received but no callback registered');
        }
    }
    
    // ========================================================================
    // API Pública
    // ========================================================================
    
    /**
     * Habilitar Android Auto
     * 
     * Inicializa el sistema Android Auto y prepara MediaBrowserService.
     * Debe ser llamado antes de usar cualquier otra funcionalidad.
     * 
     * @throws Error si falla la inicialización
     * 
     * @example
     * ```typescript
     * try {
     *     await AndroidAutoControl.enable();
     *     console.log('Android Auto enabled');
     * } catch (error) {
     *     console.error('Failed to enable:', error);
     * }
     * ```
     */
    static async enable(): Promise<void> {
        this.checkAvailability();
        
        if (this.enabled) {
            console.warn('[AndroidAuto] Already enabled');
            return;
        }
        
        try {
            // Inicializar sistema de eventos
            this.initializeEventSystem();
            
            // Habilitar en módulo nativo
            await AndroidAutoModule.enable();
            
            this.enabled = true;
            console.log('[AndroidAuto] Enabled successfully');
            
        } catch (error) {
            console.error('[AndroidAuto] Failed to enable:', error);
            throw error;
        }
    }
    
    /**
     * Deshabilitar Android Auto
     * 
     * Detiene el sistema Android Auto y limpia recursos.
     * 
     * @example
     * ```typescript
     * await AndroidAutoControl.disable();
     * ```
     */
    static async disable(): Promise<void> {
        if (!this.enabled) {
            console.warn('[AndroidAuto] Already disabled');
            return;
        }
        
        try {
            // Deshabilitar en módulo nativo
            await AndroidAutoModule.disable();
            
            // Limpiar callbacks y listeners
            this.browseCallbacks.clear();
            this.playCallback = null;
            this.searchCallback = null;
            this.cleanupEventListeners();
            
            this.enabled = false;
            this.initialized = false;
            
            console.log('[AndroidAuto] Disabled successfully');
            
        } catch (error) {
            console.error('[AndroidAuto] Failed to disable:', error);
            throw error;
        }
    }
    
    /**
     * Configurar biblioteca de medios
     * 
     * Guarda la biblioteca en caché para respuesta rápida cuando
     * Android Auto solicita contenido con la app cerrada.
     * 
     * @param items Array de MediaItems
     * @throws Error si Android Auto no está habilitado
     * 
     * @example
     * ```typescript
     * await AndroidAutoControl.setMediaLibrary([
     *     {
     *         id: 'podcasts',
     *         title: 'Podcasts',
     *         browsable: true
     *     },
     *     {
     *         id: 'podcast1',
     *         title: 'Episode 1',
     *         artist: 'Host Name',
     *         artworkUri: 'https://...',
     *         playable: true,
     *         parentId: 'podcasts'
     *     }
     * ]);
     * ```
     */
    static async setMediaLibrary(items: MediaItem[]): Promise<void> {
        this.checkAvailability();
        
        if (!this.enabled) {
            throw new Error('[AndroidAuto] Not enabled. Call enable() first');
        }
        
        try {
            await AndroidAutoModule.setMediaLibrary(items);
            console.log(`[AndroidAuto] Library set with ${items.length} items`);
        } catch (error) {
            console.error('[AndroidAuto] Failed to set library:', error);
            throw error;
        }
    }
    
    /**
     * Actualizar metadata del contenido actual
     * 
     * Actualiza la información mostrada en Android Auto durante reproducción.
     * Se sincroniza automáticamente con MediaSession.
     * 
     * @param metadata Metadata del contenido
     * 
     * @example
     * ```typescript
     * AndroidAutoControl.updateNowPlaying({
     *     title: 'Episode 1',
     *     artist: 'Podcast Name',
     *     artworkUri: 'https://...',
     *     duration: 3600,
     *     position: 120
     * });
     * ```
     */
    static updateNowPlaying(metadata: MediaMetadata): void {
        this.checkAvailability();
        
        if (!this.enabled) {
            console.warn('[AndroidAuto] Not enabled, ignoring updateNowPlaying');
            return;
        }
        
        try {
            AndroidAutoModule.updateNowPlaying(metadata);
        } catch (error) {
            console.error('[AndroidAuto] Failed to update now playing:', error);
        }
    }
    
    /**
     * Registrar callback para navegación
     * 
     * Llamado cuando Android Auto solicita contenido de un parentId.
     * Múltiples callbacks pueden ser registrados.
     * 
     * @param callback Función que retorna items para un parentId
     * @returns Función para desregistrar el callback
     * 
     * @example
     * ```typescript
     * const unsubscribe = AndroidAutoControl.onBrowseRequest((parentId) => {
     *     if (parentId === 'root') {
     *         return [
     *             { id: 'podcasts', title: 'Podcasts', browsable: true }
     *         ];
     *     }
     *     return [];
     * });
     * 
     * // Más tarde...
     * unsubscribe();
     * ```
     */
    static onBrowseRequest(callback: BrowseCallback): () => void {
        const id = Math.random().toString(36).substring(7);
        this.browseCallbacks.set(id, callback);
        
        console.log(`[AndroidAuto] Browse callback registered: ${id}`);
        
        return () => {
            this.browseCallbacks.delete(id);
            console.log(`[AndroidAuto] Browse callback unregistered: ${id}`);
        };
    }
    
    /**
     * Registrar callback para reproducción
     * 
     * Llamado cuando el usuario selecciona un item para reproducir.
     * Solo un callback puede estar activo a la vez.
     * 
     * @param callback Función que recibe el mediaId a reproducir
     * @returns Función para desregistrar el callback
     * 
     * @example
     * ```typescript
     * const unsubscribe = AndroidAutoControl.onPlayFromMediaId((mediaId) => {
     *     const item = findItemById(mediaId);
     *     loadContent(item);
     * });
     * 
     * // Más tarde...
     * unsubscribe();
     * ```
     */
    static onPlayFromMediaId(callback: PlayCallback): () => void {
        this.playCallback = callback;
        console.log('[AndroidAuto] Play callback registered');
        
        return () => {
            this.playCallback = null;
            console.log('[AndroidAuto] Play callback unregistered');
        };
    }
    
    /**
     * Registrar callback para búsqueda
     * 
     * Llamado cuando el usuario realiza una búsqueda por voz o texto.
     * Solo un callback puede estar activo a la vez.
     * 
     * @param callback Función que recibe la query de búsqueda
     * @returns Función para desregistrar el callback
     * 
     * @example
     * ```typescript
     * const unsubscribe = AndroidAutoControl.onSearch((query) => {
     *     const results = searchContent(query);
     *     return results;
     * });
     * 
     * // Más tarde...
     * unsubscribe();
     * ```
     */
    static onSearch(callback: SearchCallback): () => void {
        this.searchCallback = callback;
        console.log('[AndroidAuto] Search callback registered');
        
        return () => {
            this.searchCallback = null;
            console.log('[AndroidAuto] Search callback unregistered');
        };
    }
    
    /**
     * Verificar si Android Auto está conectado
     * 
     * @returns Promise que resuelve a true si está conectado
     * 
     * @example
     * ```typescript
     * const connected = await AndroidAutoControl.isConnected();
     * console.log('Connected:', connected);
     * ```
     */
    static async isConnected(): Promise<boolean> {
        if (!this.enabled) return false;
        
        try {
            const status = await this.getConnectionStatus();
            return status.connected;
        } catch (error) {
            console.error('[AndroidAuto] Failed to check connection:', error);
            return false;
        }
    }
    
    /**
     * Verificar si Android Auto está habilitado
     * 
     * @returns true si está habilitado
     * 
     * @example
     * ```typescript
     * if (AndroidAutoControl.isEnabled()) {
     *     console.log('Android Auto is enabled');
     * }
     * ```
     */
    static isEnabled(): boolean {
        return this.enabled;
    }
    
    /**
     * Obtener estado de conexión completo
     * 
     * @returns Estado de conexión con detalles
     * 
     * @example
     * ```typescript
     * const status = await AndroidAutoControl.getConnectionStatus();
     * console.log('Status:', status);
     * // { enabled: true, connected: false, appActive: true, jsReady: true }
     * ```
     */
    static async getConnectionStatus(): Promise<AndroidAutoConnectionStatus> {
        this.checkAvailability();
        
        try {
            const status = await AndroidAutoModule.getConnectionStatus();
            return status as AndroidAutoConnectionStatus;
        } catch (error) {
            console.error('[AndroidAuto] Failed to get status:', error);
            throw error;
        }
    }
    
    /**
     * Marcar JavaScript como listo
     * 
     * Indica que JavaScript se ha inicializado y está listo para recibir eventos.
     * Útil cuando la app se abre desde Android Auto.
     * 
     * @example
     * ```typescript
     * // En App.tsx después de inicialización
     * await AndroidAutoControl.setJavaScriptReady();
     * ```
     */
    static async setJavaScriptReady(): Promise<void> {
        this.checkAvailability();
        
        try {
            await AndroidAutoModule.setJavaScriptReady();
            console.log('[AndroidAuto] JavaScript marked as ready');
        } catch (error) {
            console.error('[AndroidAuto] Failed to set JS ready:', error);
            throw error;
        }
    }
    
    /**
     * Marcar JavaScript como no listo
     * 
     * Indica que los componentes de React se han desmontado y los callbacks
     * ya no están disponibles. Llamar en cleanup de providers.
     * 
     * @example
     * ```typescript
     * // En cleanup de AndroidAutoProvider
     * await AndroidAutoControl.setJavaScriptNotReady();
     * ```
     */
    static async setJavaScriptNotReady(): Promise<void> {
        this.checkAvailability();
        
        try {
            await AndroidAutoModule.setJavaScriptNotReady();
            console.log('[AndroidAuto] JavaScript marked as NOT ready');
        } catch (error) {
            console.error('[AndroidAuto] Failed to set JS not ready:', error);
            throw error;
        }
    }
}
