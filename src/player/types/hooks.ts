/*
 *  Hooks
 *
 */

import { type MediaTrack } from 'react-native-google-cast';
import { type OnLoadData } from '../../types';

import {
	type IBasicProgram,
	type ILanguagesMapping,
	type IManifest,
	type IMappedYoubora,
	type IPlayerMenuData,
	type IVideoSource,
	type IYoubora,
	type IYouboraSettingsFormat,
} from './types';

export interface IPlayerHooks {
	watchingProgressInterval?: number;
	addContentProgress?: (currentTime: number, duration: number, id?: number) => void;
	getBestManifest?: (
		manifests: Array<IManifest>,
		isCasting?: boolean,
		isLive?: boolean
	) => IManifest | undefined;
	getSourceUri?: (
		manifest: IManifest,
		dvrWindowMinutes?: number,
		liveStartProgramTimestamp?: number
	) => string;
	getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;
	getTudumManifest?: () => IManifest | null | undefined;
	getTudumSource?: () => IVideoSource | null | undefined;
	getEPGProgramAt?: (timestamp: number) => Promise<IBasicProgram | null>;
	mergeMenuData?: (
		loadedData: OnLoadData,
		languagesMapping?: ILanguagesMapping,
		isDASH?: boolean
	) => Array<IPlayerMenuData>;
	mergeCastMenuData?: (
		loadedData: Array<MediaTrack> | undefined,
		languagesMapping?: ILanguagesMapping
	) => Array<IPlayerMenuData>;
}
