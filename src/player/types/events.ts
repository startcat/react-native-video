/*
 *  Player Logical Props
 *
 */

import { PlayerError } from "../core/errors";
import * as Enums from "./enums";
import { type ICommonData, type IPreferencesCommonData } from "./types";

export interface IPlayerEvents {
	onStart?: () => void;
	onPlay?: () => void;
	onPause?: () => void;
	onProgress?: (value: number, duration?: number) => void;
	onSeek?: (value: number) => void;
	onBuffering?: (value: boolean) => void;

	onNext?: () => void;
	onPrevious?: () => void;

	onChangeAudioIndex?: (index: number, label?: string) => void;
	onChangeSubtitleIndex?: (index: number, label?: string) => void;
	onChangePreferences?: (data: IPreferencesCommonData) => void;

	onLiveStartProgram?: () => number | null;

	onEnd?: () => void;
	onExit?: () => void;
	onError?: (error: PlayerError) => void;
}

export interface IInnerPlayerEvents extends IPlayerEvents {
	onChangeCommonData?: (data: ICommonData) => void;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
	onSlidingStart?: (value: number) => void;
	onSlidingMove?: (value: number) => void;
	onSlidingComplete?: (value: number) => void;
	onClose?: () => void;
}
