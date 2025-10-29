import { useMemo } from "react";
import { LoggerConfigBasic } from "../../logger/types";
import { CastVolumeInfo } from "../types/types";
import { useCastState } from "./useCastState";

export function useCastVolume(config: LoggerConfigBasic = {}): CastVolumeInfo {
	const castState = useCastState(config);

	return useMemo(() => castState.volume, [castState.volume.level, castState.volume.isMuted]);
}
