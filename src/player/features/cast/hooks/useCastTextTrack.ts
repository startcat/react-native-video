import { useMemo } from "react";
import { LoggerConfigBasic } from "../../logger/types";
import { CastTrackInfo } from "../types/types";
import { useCastMedia } from "./useCastMedia";

export function useCastTextTrack(config: LoggerConfigBasic = {}): CastTrackInfo | null {
	const media = useCastMedia(config);

	return useMemo(() => media.textTrack, [media.textTrack?.id]);
}
