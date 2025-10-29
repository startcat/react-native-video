import { useMemo } from "react";
import { LoggerConfigBasic } from "../../logger/types";
import { CastTrackInfo } from "../types/types";
import { useCastMedia } from "./useCastMedia";

export function useCastAudioTrack(config: LoggerConfigBasic = {}): CastTrackInfo | null {
	const media = useCastMedia(config);

	return useMemo(() => media.audioTrack, [media.audioTrack?.id]);
}
