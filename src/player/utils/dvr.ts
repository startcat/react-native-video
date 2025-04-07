/*
 *  DVR Utils
 *
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface useDvrPausedSecondsProps {
    isLive: boolean;
    isDVR: boolean;
    paused: boolean;
}

interface Results {
    pausedSeconds: number;
    pausedDatum: number;
}

// Actualizamos la diferencia con el directo, cada segundo, para mostrarlo en los contadores
const INTERVAL = 1000;

export function useDvrPausedSeconds(props: useDvrPausedSecondsProps) {

    const intervalObj = useRef<NodeJS.Timeout>();
    const resultsRef = useRef<Results>({
        pausedSeconds: 0,
        pausedDatum: 0
    });

    const [, forceUpdate] = useState({});

    // Función para actualizar los resultados manteniendo la referencia
    const updateResults = useCallback((newResults: Results) => {
        resultsRef.current = newResults;
        forceUpdate({}); // Forzar re-renderizado para que los cambios se propaguen
    }, []);

    useEffect(() => {
        return () => {
            clearIntervalObject();
        };
    }, []);

    useEffect(() => {
        const isPaused = !!props.paused;
        const isLive = !!props.isLive;
        const isDVR = !!props.isDVR;

        if (isPaused) {
            updateResults({
                pausedSeconds: 0,
                pausedDatum: (new Date()).getTime()
            });
        }

        if (isLive && isDVR) {
            if (isPaused) {    
                intervalObj.current = setInterval(() => {
                    checkDifference();
                }, INTERVAL);
            } else {
                checkDifference();
                clearIntervalObject();
            }
        }
    }, [props.paused]);

    const clearIntervalObject = useCallback(() => {
        resultsRef.current = {
            pausedSeconds: 0,
            pausedDatum: 0
        };

        if (typeof(intervalObj.current) === 'number'){
            clearInterval(intervalObj.current);
        }
    }, []);

    const checkDifference = useCallback(() => {
        const currentResults = resultsRef.current;
        if (typeof(currentResults?.pausedDatum) === 'number' && currentResults?.pausedDatum > 0){
            try {
                const now = (new Date()).getTime();
                const diferenciaMilisegundos = now - currentResults.pausedDatum!;
                const segundos = diferenciaMilisegundos / 1000;

                updateResults({
                    pausedSeconds: segundos,
                    pausedDatum: now
                });
            } catch(ex){
                console.warn(`[Player DVR Utils] useDvrPausedSeconds: ${ex?.message}`);
            }
        }
    }, [updateResults]);

    return useMemo(() => resultsRef.current, [resultsRef.current]);
}