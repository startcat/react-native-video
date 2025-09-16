export enum QueuePriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    URGENT = 3,
}

export interface QueueItem {
    downloadId: string;
    priority: QueuePriority;
    addedAt: number;
    retryCount: number;
}

export interface QueueStatus {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    total: number;
}
