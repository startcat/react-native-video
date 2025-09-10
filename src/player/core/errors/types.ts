import { ERROR_DEFINITIONS } from "./definitions";

export const PLAYER_ERROR_CODES = {
    ...ERROR_DEFINITIONS,
} as const;
  
export type PlayerErrorCodeKey = keyof typeof PLAYER_ERROR_CODES;
  