import { PLAYER_ERROR_CODES, PlayerErrorCodeKey } from "./types";

export class PlayerError extends Error {
	public readonly key: PlayerErrorCodeKey;
	public readonly category: string;
	public readonly context?: Record<string, any>;
	public readonly timestamp: number;

	constructor(key: PlayerErrorCodeKey, context?: Record<string, any>) {
		const errorDef = PLAYER_ERROR_CODES[key];
		super(errorDef?.message || key?.toString());

		this.name = "PlayerError";
		this.key = key;
		this.category = this.extractCategoryFromCode(key?.toString() || "");
		this.context = context;
		this.timestamp = Date.now();

		Object.setPrototypeOf(this, new.target.prototype); // Necesario para herencia correcta
	}

	private extractCategoryFromCode(key: string): string {
		return key.split("_")[0] || ""; // PLAYER_CAST_ERROR -> "PLAYER"
	}
}
