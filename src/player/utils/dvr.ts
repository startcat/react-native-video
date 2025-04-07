/*
 *  DVR Utils
 *
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

interface useDvrPausedSecondsProps {
    isLive: boolean;
    isDVR: boolean;
    paused: boolean;
}

const INTERVAL = 10000;

export function useDvrPausedSeconds(props: useDvrPausedSecondsProps) {
	// const [pausedDatum, setPausedDatum] = useState<Date | null>(null);
    const [pausedSeconds, setPausedSeconds] = useState<number>(0);

    const intervalObj = useRef<NodeJS.Timeout>();
    const pausedDatum = useRef<number>();

    useEffect(() => {
        return () => {
            console.log(`[DANI] useDvrPausedSeconds unmount...`);
            clearIntervalObject();

        };

    }, []);

	useEffect(() => {
		const isPaused = !!props.paused;
        const isLive = !!props.isLive;
        const isDVR = !!props.isDVR;

        console.log(`[DANI] useDvrPausedSeconds isPaused ${isPaused} (isLive ${isLive} / isDVR ${isDVR})`);

        if (isPaused){
            console.log(`[DANI] useDvrPausedSeconds setPausedDatum`);
            pausedDatum.current = (new Date()).getTime();

        }

		if (isLive && isDVR) {

            if (isPaused){    
                console.log(`[DANI] useDvrPausedSeconds setInterval`);
                intervalObj.current = setInterval(() => {
                    // Moveremos la barra cada 1 minuto
                    checkDifference();
    
                }, INTERVAL);

            } else {
                
                checkDifference();
                clearIntervalObject();
                // setPausedDatum(null);

            }

		}

	}, [props.paused]);

    const clearIntervalObject = useCallback(() => {

        console.log(`[DANI] useDvrPausedSeconds clearIntervalObject...`);

        if (typeof(intervalObj.current) === 'number'){
            clearInterval(intervalObj.current);
        }

    }, [intervalObj.current]);

    const checkDifference = useCallback(() => {

        console.log(`[DANI] useDvrPausedSeconds checkDifference... pausedDatum ${pausedDatum.current}`);

        if (typeof(pausedDatum.current) === 'number' && pausedDatum.current > 0){
                
            try {
                const now = (new Date()).getTime();
                const diferenciaMilisegundos = now - pausedDatum.current!;
                const segundos = Math.floor(diferenciaMilisegundos / 1000);
                console.log(`[DANI] useDvrPausedSeconds checkDifference - now ${now}`);
                setPausedSeconds(segundos);
                pausedDatum.current = (new Date()).getTime();
                console.log(`[Player DVR Utils] useDvrPausedSeconds ${segundos} seg.`);

            } catch(ex){
                console.warn(`[Player DVR Utils] useDvrPausedSeconds: ${ex?.message}`);

            }

        }

    }, [pausedDatum.current]);

    return useMemo(() => ({
		pausedSeconds,
		pausedDatum: pausedDatum.current
	}), [pausedSeconds, pausedDatum.current]);
}
