/*
 *  Contexto de la instancia del Player
 *
 */

import { Logger } from "../../features/logger";
import { type IPlayerInstanceContext } from "./types";

export class PlayerContext implements IPlayerInstanceContext {
	private static instanceCounter = 0;

	private instanceId: number;
	public readonly logger: Logger;

	constructor(logger: Logger) {
		// Generar un ID único para esta instancia
		this.instanceId = ++PlayerContext.instanceCounter;
		this.logger = logger;

		if (this.logger) {
			this.logger.setInstanceId(this.instanceId);
			this.logger.info("PlayerContext", "PlayerContext created");
		} else {
			console.log(`PlayerContext created without logger: ${this.instanceId}`);
		}
	}

	getInstanceId(): number {
		return this.instanceId;
	}
}
