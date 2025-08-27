import { LoggerConfigBasic } from '../../logger/types';
import { CastMediaInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastMedia(config: LoggerConfigBasic = {}): CastMediaInfo {
    const castState = useCastState(config);

    return castState.media;
}