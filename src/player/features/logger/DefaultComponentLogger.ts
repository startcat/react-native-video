/*
 *  Implementación del logger específico para componente
 *
 */

import { type ComponentLogger, type ILogger, LogLevel } from './types';

export class DefaultComponentLogger implements ComponentLogger {
	constructor(
		private logger: ILogger,
		private componentName: string,
		private enabled: boolean = true,
		private level: LogLevel = LogLevel.ERROR
	) {}

	debug(message: string, ...args: any[]): void {
		if (!this.enabled || LogLevel.DEBUG < this.level) {
			return;
		}

		this.logger.debug(this.componentName, message, ...args);
	}

	info(message: string, ...args: any[]): void {
		if (!this.enabled || LogLevel.INFO < this.level) {
			return;
		}

		this.logger.info(this.componentName, message, ...args);
	}

	warn(message: string, ...args: any[]): void {
		if (!this.enabled || LogLevel.WARN < this.level) {
			return;
		}

		this.logger.warn(this.componentName, message, ...args);
	}

	error(message: string, ...args: any[]): void {
		if (!this.enabled || LogLevel.ERROR < this.level) {
			return;
		}

		this.logger.error(this.componentName, message, ...args);
	}

	temp(message: string, ...args: any[]): void {
		if (!this.enabled) {
			return;
		}

		this.logger.temp(this.componentName, message, ...args);
	}

	log(level: LogLevel, message: string, ...args: any[]): void {
		if (!this.enabled || (level < this.level && level !== LogLevel.TEMP)) {
			return;
		}

		this.logger.log(level, this.componentName, message, ...args);
	}
}
