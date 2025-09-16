import { useCallback, useEffect, useState } from 'react';
import { networkService } from '../services/network/NetworkService';

/*
 * Hook para gestionar cola offline
 *
 */

export function useOfflineQueue() {

    const [queue, setQueue] = useState<string[]>(() => 
        networkService.getOfflineQueue()
    );
  
    const addToQueue = useCallback((downloadId: string) => {
        networkService.addToOfflineQueue(downloadId);
        setQueue(networkService.getOfflineQueue());
    }, []);
  
    const clearQueue = useCallback(() => {
        networkService.clearOfflineQueue();
        setQueue([]);
    }, []);
  
    useEffect(() => {
        // Escuchar cuando la cola esté lista para procesar
        const handleQueueReady = (readyQueue: string[]) => {
            setQueue([]);
            // Aquí podrías disparar las descargas pendientes
            console.log('Offline queue ready to process:', readyQueue);
        };
  
        const unsubscribe = networkService.subscribeToQueueEvents(handleQueueReady);
      
        return unsubscribe;
    }, []);
  
    return {
        queue,
        addToQueue,
        clearQueue,
        queueSize: queue.length,
    };
}