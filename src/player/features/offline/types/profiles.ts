import { LogLevel } from '../../logger';

export interface ProfileManagerConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    enableProfileFiltering: boolean;
}

export interface ProfileContext {
    id: string;
    name: string;
    isChild: boolean;
    avatarUrl?: string;
}

export enum ProfileEventType {
    PROFILE_CHANGED = 'profile_changed',
    FILTERING_CHANGED = 'filtering_changed',
}

export interface ProfileEventData {
    previous?: ProfileContext | null;
    current?: ProfileContext | null;
    enabled?: boolean;
}

export type ProfileStatusCallback = (data: ProfileEventData) => void;

export interface ProfileDownloadMapping {
    profileId: string;
    downloadIds: string[];
    addedAt: number;
}


