/*
 *  Hooks
 *
 */

import { type OnLoadData } from '../../types';
import { type MediaTrack } from 'react-native-google-cast';

import {
    type IManifest,
    type IYoubora,
    type IYouboraSettingsFormat,
    type IMappedYoubora,
    type IVideoSource,
    type IBasicProgram,
    type ILanguagesMapping,
    type IPlayerMenuData,
} from './types';

export interface IPlayerHooks {
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => void;
    getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number) => string;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;
    getTudumManifest?: () => IManifest | null | undefined;
    getTudumSource?: () => IVideoSource | null | undefined;
    getEPGProgramAt?: (timestamp:number) => Promise<IBasicProgram | null>;
    getEPGNextProgram?: (program:IBasicProgram) => Promise<IBasicProgram | null>;
    mergeMenuData?: (loadedData: OnLoadData, languagesMapping?: ILanguagesMapping, isDASH?: boolean) => Array<IPlayerMenuData>;
    mergeCastMenuData?: (loadedData: Array<MediaTrack> | undefined, languagesMapping?: ILanguagesMapping) => Array<IPlayerMenuData>;
}