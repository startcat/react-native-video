import { useMemo } from "react";
import { PlayerError } from "../../../core/errors";
import { LoggerConfigBasic } from "../../logger";
import { useCastState } from "./useCastState";

export function useCastError(config: LoggerConfigBasic = {}): PlayerError | null {
	const castState = useCastState(config);

	return useMemo(() => castState.error, [castState.error]);
}
