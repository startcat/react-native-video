import { useMemo } from "react";
import { LoggerConfigBasic } from "../../logger/types";
import { useCastMedia } from "./useCastMedia";

export function useCastPlaying(config: LoggerConfigBasic = {}): boolean {
	const media = useCastMedia(config);

	return useMemo(() => media.isPlaying, [media.isPlaying]);
}
