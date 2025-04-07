/*
 *  DVR Utils
 *
 */

import React, { useEffect, useState, useRef } from 'react';
import BackgroundTimer from 'react-native-background-timer';

interface useDvrPausedSecondsProps {
    isLive: boolean;
    isDVR: boolean;
    paused: boolean;
}

const INTERVAL = 60000;

export function useDvrPausedSeconds(props: useDvrPausedSecondsProps) {
	const [pausedDatum, setPausedDatum] = useState<Date | null>(null);
    const [pausedSeconds, setPausedSeconds] = useState<number>(0);

    const intervalObj = useRef<number>();

	useEffect(() => {
		const isPaused = !!props.paused;
        const isLive = !!props.isLive;
        const isDVR = !!props.isDVR;

		if (isLive && isDVR) {

            if (isPaused){
                setPausedDatum(new Date());

                intervalObj.current = BackgroundTimer.setInterval(() => {
                    // Moveremos la barra cada 1 minuto
                    checkDifference();
    
                }, INTERVAL);

            } else if (pausedDatum !== null){
                
                checkDifference();
                setPausedDatum(null);

            }

		}

        return () => {
            clearInterval();

        };

	}, [props.paused, props.isLive, props.isDVR]);

    const clearInterval = () => {

        if (intervalObj.current){
            BackgroundTimer.clearInterval(intervalObj.current);
        }

    }

    const checkDifference = () => {

        if (pausedDatum !== null){
                
            try {
                const diferenciaMilisegundos = (new Date().getTime()) - pausedDatum.getTime();
                const segundos = Math.floor(diferenciaMilisegundos / 1000);
                setPausedSeconds(segundos);
                setPausedDatum(new Date());
                console.warn(`[Player DVR Utils] useDvrPausedSeconds ${segundos} seg.`);

            } catch(ex){
                console.warn(`[Player DVR Utils] useDvrPausedSeconds: ${ex?.message}`);

            }

        }

    }

	// Usamos useMemo para devolver un objeto estable que no cause re-renders innecesarios
	return pausedSeconds;
}
