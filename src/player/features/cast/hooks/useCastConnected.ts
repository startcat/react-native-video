import { useMemo } from "react";
import { LoggerConfigBasic } from "../../logger";
import { useCastConnection } from "./useCastConnection";

export function useCastConnected(config: LoggerConfigBasic = {}): boolean {
	const connection = useCastConnection(config);

	const isConnected = useMemo(() => {
		return connection.status === "connected";
	}, [connection.status]);

	return isConnected;
}
