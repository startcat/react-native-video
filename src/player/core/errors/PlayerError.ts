import { PLAYER_ERROR_CODES, PlayerErrorCategory, PlayerErrorCodeKey, PlayerErrorDetails } from "./types";

export class PlayerError extends Error {
    
    public readonly code: number;
    public readonly category: PlayerErrorCategory;
    public readonly details?: PlayerErrorDetails;
    public readonly key: PlayerErrorCodeKey;
  
    constructor(key: PlayerErrorCodeKey, details?: PlayerErrorDetails) {
        const { code, category, message } = PLAYER_ERROR_CODES[key];
        super(message);

        this.name = "PlayerError";
        this.code = code;
        this.category = category;
        this.details = details;
        this.key = key;
  
        Object.setPrototypeOf(this, new.target.prototype); // Necesario para herencia correcta
    }

}
