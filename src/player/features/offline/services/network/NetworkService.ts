/*
 * Servicio singleton para gestión de conectividad de red
 *
 */

import NetInfo, {
	NetInfoCellularState,
	NetInfoState,
	NetInfoStateType,
	NetInfoSubscription,
} from "@react-native-community/netinfo";
import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../../core/errors";
import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import {
	DEFAULT_CONFIG_NETWORK,
	DEFAULT_CONFIG_NETWORK_POLICY,
	LOGGER_DEFAULTS,
} from "../../defaultConfigs";
import {
	NetworkEventType,
	NetworkPolicy,
	NetworkServiceConfig,
	NetworkStatus,
	NetworkStatusCallback,
} from "../../types";

const TAG = LOG_TAGS.NETWORK_SERVICE;
export class NetworkService {
	private static instance: NetworkService;
	private eventEmitter: EventEmitter;
	private netInfoSubscription: NetInfoSubscription | null = null;
	private currentStatus: NetworkStatus;
	private previousStatus: NetworkStatus | null = null;
	private isMonitoring: boolean = false;
	private initPromise: Promise<void> | null = null;
	private config: NetworkServiceConfig;
	private currentLogger: Logger;
	private networkPolicy: NetworkPolicy;
	private pausedDownloads: Set<string> = new Set();

	private constructor() {
		this.eventEmitter = new EventEmitter();

		this.currentStatus = {
			isConnected: false,
			isWifi: false,
			isCellular: false,
			isInternetReachable: false,
		};

		this.config = DEFAULT_CONFIG_NETWORK;
		this.networkPolicy = DEFAULT_CONFIG_NETWORK_POLICY;

		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});
	}

	/*
	 * Obtiene la instancia singleton del servicio
	 *
	 */

	public static getInstance(): NetworkService {
		if (!NetworkService.instance) {
			NetworkService.instance = new NetworkService();
		}
		return NetworkService.instance;
	}

	/*
	 * Inicializa el servicio de red
	 *
	 */

	public async initialize(config?: Partial<NetworkServiceConfig>): Promise<void> {
		if (this.isMonitoring) {
			return;
		}

		// Si hay una inicialización en progreso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.initPromise = (async () => {
			// Actualizar configuración
			this.config = { ...this.config, ...config };

			this.currentLogger.updateConfig({
				enabled: this.config.logEnabled,
				level: this.config.logLevel,
			});

			// Obtener estado inicial
			try {
				await this.fetchNetworkStatus();
			} catch (error) {
				throw new PlayerError("NETWORK_SERVICE_INITIALIZATION_FAILED", {
					originalError: error,
				});
			} finally {
				// Limpiar promesa pendiente
				this.initPromise = null;
			}

			this.currentLogger.info(
				TAG,
				`NetworkService initialized: ${JSON.stringify(this.currentStatus)}`
			);

			if (!this.config.disableAutoStart) {
				this.startMonitoring();
			}
		})();

		return this.initPromise;
	}

	/*
	 * Inicia el monitoreo de red
	 *
	 */

	public startMonitoring(): void {
		if (this.isMonitoring) {
			return;
		}

		this.isMonitoring = true;

		// Suscribirse a cambios de estado de red
		this.netInfoSubscription = NetInfo.addEventListener((state: NetInfoState) => {
			this.handleNetworkStateChange(state);
		});

		this.currentLogger.info(TAG, "Network monitoring started");
	}

	/*
	 * Detiene el monitoreo de red
	 *
	 */

	public stopMonitoring(): void {
		if (!this.isMonitoring) {
			return;
		}

		this.isMonitoring = false;

		// Cancelar suscripción
		if (this.netInfoSubscription) {
			this.netInfoSubscription();
			this.netInfoSubscription = null;
		}

		this.currentLogger.info(TAG, "Network monitoring stopped");
	}

	/*
	 * Obtiene el estado actual de la red
	 *
	 */

	public async fetchNetworkStatus(): Promise<NetworkStatus> {
		try {
			const state = await NetInfo.fetch();
			this.currentStatus = this.parseNetworkState(state);

			return this.currentStatus;
		} catch (error) {
			this.currentLogger.error(TAG, `Error fetching network status: ${error}`);
			throw new PlayerError("NETWORK_SERVICE_STATUS_FETCH_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Espera a que la red esté disponible con un timeout
	 * Útil para evitar condiciones de carrera al inicio de la app
	 */

	public async waitForNetwork(timeoutMs: number = 3000): Promise<boolean> {
		// Si ya está online, retornar inmediatamente
		if (this.isOnline()) {
			return true;
		}

		// Intentar fetch primero
		try {
			await this.fetchNetworkStatus();
			if (this.isOnline()) {
				return true;
			}
		} catch {
			// Ignorar error de fetch
		}

		// Esperar a que el listener reporte conexión
		return new Promise<boolean>(resolve => {
			const timeout = setTimeout(() => {
				unsubscribe();
				resolve(this.isOnline());
			}, timeoutMs);

			const unsubscribe = NetInfo.addEventListener(state => {
				const status = this.parseNetworkState(state);
				if (status.isConnected && status.isInternetReachable) {
					clearTimeout(timeout);
					unsubscribe();
					this.currentStatus = status;
					resolve(true);
				}
			});
		});
	}

	/*
	 * Obtiene el estado actual sin hacer fetch
	 *
	 */

	public getCurrentStatus(): NetworkStatus {
		return { ...this.currentStatus };
	}

	/*
	 * Verifica si se puede descargar según la configuración
	 *
	 */

	public canDownload(requireWifiOnly: boolean = false): boolean {
		if (!this.currentStatus.isConnected || !this.currentStatus.isInternetReachable) {
			return false;
		}

		if (requireWifiOnly || this.networkPolicy.requiresWifi) {
			return this.currentStatus.isWifi;
		}

		if (this.currentStatus.isCellular && !this.networkPolicy.allowCellular) {
			return false;
		}

		return true;
	}

	/*
	 * Obtiene la política de red actual
	 *
	 */

	public getNetworkPolicy(): NetworkPolicy {
		return { ...this.networkPolicy };
	}

	/*
	 * Establece la política de red
	 *
	 */

	public setNetworkPolicy(policy: Partial<NetworkPolicy>): void {
		this.networkPolicy = { ...this.networkPolicy, ...policy };
		this.currentLogger.info(TAG, "Network policy updated:", this.networkPolicy);

		// Emitir evento de cambio de política
		this.eventEmitter.emit("policy_changed", this.networkPolicy);
	}

	/*
	 * Verifica si las descargas están permitidas con la red actual
	 *
	 */

	public areDownloadsAllowed(): boolean {
		return this.canDownload();
	}

	/*
	 * Verifica si las descargas están pausadas por la red
	 *
	 */

	public areDownloadsPausedByNetwork(): boolean {
		return this.pausedDownloads.size > 0;
	}

	/*
	 * Pausa descargas cuando se está en red celular
	 *
	 */

	public async pauseOnCellular(downloadIds?: string[]): Promise<void> {
		if (!this.currentStatus.isCellular) {
			return;
		}

		const idsToPause = downloadIds || ["all"]; // Si no se especifica, pausar todas

		idsToPause.forEach(id => this.pausedDownloads.add(id));

		this.currentLogger.info(TAG, `Paused downloads on cellular: ${idsToPause.join(", ")}`);
		this.eventEmitter.emit("downloads_paused_cellular", idsToPause);
	}

	/*
	 * Reanuda descargas cuando se conecta a WiFi
	 *
	 */

	public async resumeOnWifi(downloadIds?: string[]): Promise<void> {
		if (!this.currentStatus.isWifi) {
			return;
		}

		const idsToResume = downloadIds || Array.from(this.pausedDownloads);

		idsToResume.forEach(id => this.pausedDownloads.delete(id));

		if (idsToResume.length > 0) {
			this.currentLogger.info(TAG, `Resumed downloads on WiFi: ${idsToResume.join(", ")}`);
			this.eventEmitter.emit("downloads_resumed_wifi", idsToResume);
		}
	}

	/*
	 * Obtiene el tipo de conexión actual
	 *
	 */

	public getConnectionType(): "wifi" | "cellular" | "none" {
		if (!this.currentStatus.isConnected) {
			return "none";
		}

		if (this.currentStatus.isWifi) {
			return "wifi";
		}

		if (this.currentStatus.isCellular) {
			return "cellular";
		}

		return "none";
	}

	/*
	 * Verifica si hay conexión WiFi
	 *
	 */

	public isWifiConnected(): boolean {
		return this.currentStatus.isWifi && this.currentStatus.isConnected;
	}

	/*
	 * Verifica si hay conexión celular
	 *
	 */

	public isCellularConnected(): boolean {
		return this.currentStatus.isCellular && this.currentStatus.isConnected;
	}

	/*
	 * Verifica si hay conexión a internet
	 *
	 */

	public isOnline(): boolean {
		return this.currentStatus.isConnected && this.currentStatus.isInternetReachable;
	}

	/*
	 * Obtiene la calidad de la conexión celular
	 *
	 */

	public getCellularQuality(): "poor" | "moderate" | "good" | "excellent" | "unknown" {
		if (!this.currentStatus.isCellular || !this.currentStatus.cellularGeneration) {
			return "unknown";
		}

		switch (this.currentStatus.cellularGeneration) {
			case "2g":
				return "poor";
			case "3g":
				return "moderate";
			case "4g":
				return "good";
			case "5g":
				return "excellent";
			default:
				return "unknown";
		}
	}

	/*
	 * Suscribe a cambios de estado de red
	 *
	 */

	public subscribe(event: NetworkEventType | "all", callback: NetworkStatusCallback): () => void {
		if (event === "all") {
			// Suscribir a todos los eventos
			Object.values(NetworkEventType).forEach(eventType => {
				this.eventEmitter.on(eventType, callback);
			});

			// Retornar función para desuscribir
			return () => {
				Object.values(NetworkEventType).forEach(eventType => {
					this.eventEmitter.off(eventType, callback);
				});
			};
		} else {
			this.eventEmitter.on(event, callback);
			return () => this.eventEmitter.off(event, callback);
		}
	}

	/*
	 * Suscribe a un evento arbitrario del eventEmitter interno
	 * Permite suscribirse a eventos custom (policy_changed, downloads_paused_cellular, etc.)
	 * sin acceder directamente al eventEmitter privado
	 *
	 */

	public onEvent(event: string, callback: (...args: unknown[]) => void): () => void {
		this.eventEmitter.on(event, callback);
		return () => this.eventEmitter.off(event, callback);
	}

	/*
	 * Maneja cambios en el estado de red
	 *
	 */

	private handleNetworkStateChange(state: NetInfoState): void {
		this.previousStatus = { ...this.currentStatus };
		this.currentStatus = this.parseNetworkState(state);

		// Detectar y emitir eventos específicos
		this.detectAndEmitEvents();

		// ✅ NOTA: QueueManager maneja su propia lógica cuando vuelve la conexión
		// NetworkService solo informa del cambio de red

		// Aplicar políticas automáticas
		this.applyAutomaticPolicies();

		this.currentLogger.info(
			TAG,
			`Network state changed: ${JSON.stringify(this.currentStatus)}`
		);
	}

	/*
	 * Parsea el estado de NetInfo a nuestro formato
	 *
	 */

	private parseNetworkState(state: NetInfoState): NetworkStatus {
		const status: NetworkStatus = {
			isConnected: state.isConnected ?? false,
			isWifi: state.type === NetInfoStateType.wifi,
			isCellular: state.type === NetInfoStateType.cellular,
			isInternetReachable: state.isInternetReachable ?? false,
			details: state,
		};

		// Añadir generación celular si aplica
		if (state.type === NetInfoStateType.cellular && state.details) {
			const cellularDetails = state.details as NetInfoCellularState;
			status.cellularGeneration = cellularDetails.cellularGeneration;
		}

		return status;
	}

	/*
	 * Detecta y emite eventos basados en cambios de estado
	 *
	 */

	private detectAndEmitEvents(): void {
		if (!this.previousStatus) {
			return;
		}

		const prev = this.previousStatus;
		const curr = this.currentStatus;

		// Conexión general
		if (!prev.isConnected && curr.isConnected) {
			this.eventEmitter.emit(NetworkEventType.CONNECTED, curr);
		} else if (prev.isConnected && !curr.isConnected) {
			this.eventEmitter.emit(NetworkEventType.DISCONNECTED, curr);
		}

		// WiFi
		if (!prev.isWifi && curr.isWifi) {
			this.eventEmitter.emit(NetworkEventType.WIFI_CONNECTED, curr);
		} else if (prev.isWifi && !curr.isWifi) {
			this.eventEmitter.emit(NetworkEventType.WIFI_DISCONNECTED, curr);
		}

		// Celular
		if (!prev.isCellular && curr.isCellular) {
			this.eventEmitter.emit(NetworkEventType.CELLULAR_CONNECTED, curr);
		} else if (prev.isCellular && !curr.isCellular) {
			this.eventEmitter.emit(NetworkEventType.CELLULAR_DISCONNECTED, curr);
		}

		// Cambio de tipo
		if (prev.isWifi !== curr.isWifi || prev.isCellular !== curr.isCellular) {
			this.eventEmitter.emit(NetworkEventType.TYPE_CHANGED, curr);
		}
	}

	/*
	 * Aplica políticas automáticas según el cambio de red
	 *
	 */

	private applyAutomaticPolicies(): void {
		if (!this.previousStatus) {
			return;
		}

		const prev = this.previousStatus;
		const curr = this.currentStatus;

		// Pausar en celular si está configurado
		if (!prev.isCellular && curr.isCellular && this.networkPolicy.pauseOnCellular) {
			this.pauseOnCellular();
		}

		// Reanudar en WiFi si está configurado
		if (!prev.isWifi && curr.isWifi && this.networkPolicy.resumeOnWifi) {
			this.resumeOnWifi();
		}
	}

	/*
	 * Limpia recursos al destruir
	 *
	 */

	public destroy(): void {
		this.stopMonitoring();
		this.eventEmitter.removeAllListeners();
		this.pausedDownloads.clear();
	}
}

// Exportar instancia singleton
export const networkService = NetworkService.getInstance();
