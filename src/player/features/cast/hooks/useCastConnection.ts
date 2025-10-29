import { useMemo } from "react";
import { LoggerConfigBasic } from "../../logger/types";
import { CastConnectionInfo } from "../types/types";
import { useCastState } from "./useCastState";

export function useCastConnection(config: LoggerConfigBasic = {}): CastConnectionInfo {
	const castState = useCastState(config);

	return useMemo(() => castState.connection, [castState.connection.status]);
}
