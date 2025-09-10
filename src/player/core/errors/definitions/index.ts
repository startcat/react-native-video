import { DEVICE_ERROR_DEFINITIONS } from "./device-errors";
import { DOWNLOAD_ERROR_DEFINITIONS } from "./download-errors";
import { NETWORK_ERROR_DEFINITIONS } from "./network-errors";
import { PERMISSION_ERROR_DEFINITIONS } from "./permissions-errors";
import { PLAYER_ERROR_DEFINITIONS } from "./player-errors";
import { STORAGE_ERROR_DEFINITIONS } from "./storage-errors";

export const ERROR_DEFINITIONS = {
	...STORAGE_ERROR_DEFINITIONS,
	...NETWORK_ERROR_DEFINITIONS,
	...PLAYER_ERROR_DEFINITIONS,
	...PERMISSION_ERROR_DEFINITIONS,
	...DOWNLOAD_ERROR_DEFINITIONS,
	...DEVICE_ERROR_DEFINITIONS,
};

export type ErrorCodeKey = keyof typeof ERROR_DEFINITIONS;
