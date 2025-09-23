export const DEFAULT_CONFIG = {
	// Configuración de descargas
	MAX_CONCURRENT_DOWNLOADS: 3,
	MAX_RETRY_ATTEMPTS: 3,
	RETRY_DELAY_MS: 5000,
	RETRY_BACKOFF_MULTIPLIER: 2,

	// Configuración de progreso
	PROGRESS_UPDATE_INTERVAL_MS: 500,
	PROGRESS_THRESHOLD_PERCENT: 1, // Actualizar solo si cambia más del 1%

	// Configuración de archivos
	CHUNK_SIZE_BYTES: 1024 * 1024, // 1MB
	MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024 * 1024, // 5GB

	// Configuración de almacenamiento
	STORAGE_WARNING_THRESHOLD: 0.9, // 90% lleno
	MIN_FREE_SPACE_MB: 200,
	CLEANUP_INTERVAL_HOURS: 24,

	// Configuración de red
	NETWORK_CHECK_INTERVAL_MS: 30000, // 30 segundos
	DOWNLOAD_TIMEOUT_MS: 300000, // 5 minutos sin progreso

	// Configuración de persistencia
	STORAGE_KEY: "@downloads_state_v1",

	// Configuración de DRM
	DRM_LICENSE_TIMEOUT_MS: 30000, // 30 segundos
	DRM_MAX_LICENSE_RETRIES: 3,
	DRM_LICENSE_CACHE_DURATION_MS: 3600000, // 1 hora
};

export const DIRECTORIES = {
	ROOT: "Downloads",
	TEMP: "TempDownloads",
	STREAMS: "Streams",
	BINARIES: "Binaries",
	DRM_LICENSES: "Licenses",
	SUBTITLES: "Subtitles",
} as const;

export const FILE_EXTENSIONS = {
	VIDEO: [".mp4", ".mkv", ".avi", ".mov", ".webm"],
	AUDIO: [".mp3", ".aac", ".wav", ".flac", ".m4a"],
	MANIFEST: [".mpd", ".m3u8"],
	SUBTITLE: [".vtt", ".srt", ".ass"],
	IMAGE: [".jpg", ".jpeg", ".png", ".webp"],
} as const;

export const MIME_TYPES = {
	VIDEO: {
		MP4: "video/mp4",
		WEBM: "video/webm",
		MKV: "video/x-matroska",
	},
	AUDIO: {
		MP3: "audio/mpeg",
		AAC: "audio/aac",
		WAV: "audio/wav",
		FLAC: "audio/flac",
	},
	MANIFEST: {
		DASH: "application/dash+xml",
		HLS: "application/vnd.apple.mpegurl",
	},
} as const;

export const LIMITS = {
	MAX_DOWNLOADS_PER_PROFILE: 100,
	MAX_QUEUE_SIZE: 50,
	MAX_FILENAME_LENGTH: 255,
	MAX_PATH_LENGTH: 4096,
	MIN_DISK_SPACE_MB: 200,
	MAX_CONCURRENT_NETWORK_CHECKS: 5,
} as const;

export const QUEUE_PRIORITY_WEIGHTS = {
	LOW: 1,
	NORMAL: 5,
	HIGH: 10,
	URGENT: 100,
} as const;

export const VALID_STATE_TRANSITIONS: Record<string, string[]> = {
	NOT_DOWNLOADED: ["QUEUED", "PREPARING", "DOWNLOADING"],
	QUEUED: ["PREPARING", "DOWNLOADING", "PAUSED", "CANCELLED", "WAITING_FOR_NETWORK"],
	PREPARING: ["DOWNLOADING", "FAILED", "PAUSED", "CANCELLED"],
	DOWNLOADING: ["COMPLETED", "PAUSED", "FAILED", "CANCELLED", "WAITING_FOR_NETWORK"],
	PAUSED: ["DOWNLOADING", "QUEUED", "CANCELLED", "FAILED"],
	COMPLETED: ["REMOVING", "RESTART"],
	FAILED: ["RESTART", "REMOVING", "QUEUED"],
	CANCELLED: ["RESTART", "REMOVING", "QUEUED"],
	WAITING_FOR_NETWORK: ["QUEUED", "DOWNLOADING", "CANCELLED"],
	RESTART: ["RESTARTING"],
	RESTARTING: ["PREPARING", "DOWNLOADING", "FAILED"],
	REMOVING: ["NOT_DOWNLOADED"],
} as const;

export const PATTERNS = {
	URL: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
	FILENAME: /^[a-zA-Z0-9._\- ]+$/,
	VIDEO_URL: /\.(mp4|mkv|avi|mov|webm)(\?.*)?$/i,
	AUDIO_URL: /\.(mp3|aac|wav|flac|m4a)(\?.*)?$/i,
	MANIFEST_URL: /\.(mpd|m3u8)(\?.*)?$/i,
} as const;

export const LOG_TAGS = {
	MAIN: "💾 Offline",
	DOWNLOAD_MANAGER: "Download Manager",
	QUEUE_MANAGER: "Queue Manager",
	CONFIG_MANAGER: "Config Manager",
	NETWORK_SERVICE: "Network Service",
	STORAGE_SERVICE: "Storage Service",
	DRM_SERVICE: "DRM Service",
	BINARY_DOWNLOADER: "Binary Downloader",
	STREAM_DOWNLOADER: "Stream Downloader",
	DOWNLOAD_SERVICE: "Download Service",
	DOWNLOADS_MANAGER: "Downloads Manager",
	PROFILE_MANAGER: "Profile Manager",
	PERSISTENCE: "Persistence",
	NATIVE_MANAGER: "Native Manager",
} as const;

export const METRIC_KEYS = {
	TOTAL_DOWNLOADED: "metric:total_downloaded",
	TOTAL_FAILED: "metric:total_failed",
	AVERAGE_SPEED: "metric:average_speed",
	DATA_WIFI: "metric:data_wifi",
	DATA_CELLULAR: "metric:data_cellular",
	SUCCESS_RATE: "metric:success_rate",
} as const;
