import { LogLevel } from '../../logger';

export interface ProfileManagerConfig {
    logEnabled?: boolean;
    logLevel?: LogLevel;
    enableProfileFiltering?: boolean;
    activeProfileRequired?: boolean;
}

export interface ProfileContext {
    id: string;
    name: string;
    isChild: boolean;
}

export enum ProfileEventType {
    PROFILE_CHANGED = 'profile_changed',
    FILTERING_CHANGED = 'filtering_changed',
    CONFIG_CHANGED = 'config_changed',
}

export interface ProfileEventData {
    previous?: ProfileContext | null;
    current?: ProfileContext | null;
    enabled?: boolean;
    activeProfileRequired?: boolean;
}

export type ProfileStatusCallback = (data: ProfileEventData) => void;

export interface ProfileDownloadMapping {
    profileId: string;
    downloadIds: string[];
    addedAt: number;
}


