/*
 *  DVR Utils
 *
 */

import React, { useEffect, useState, useMemo } from 'react';

interface useDvrPausedSecondsProps {
    isLive: boolean;
    isDVR: boolean;
    paused: boolean;
}

export function useDvrPausedSeconds(props: useDvrPausedSecondsProps) {
	const [pausedDatum, setPausedDatum] = useState<Date | null>(null);
    const [pausedSeconds, setPausedSeconds] = useState<number>(0);

	useEffect(() => {
		const isPaused = !!props.paused;
        const isLive = !!props.isLive;
        const isDVR = !!props.isDVR;

		if (isLive && isDVR) {

            if (isPaused){
                setPausedDatum(new Date());

            } else if (pausedDatum !== null){
                
                try {
                    const diferenciaMilisegundos = (new Date().getTime()) - pausedDatum.getTime();
                    const segundos = Math.floor(diferenciaMilisegundos / 1000);
                    setPausedSeconds(segundos);
                    setPausedDatum(null);

                } catch(ex){
                    console.warn(`[Player DVR Utils] useDvrPausedSeconds: ${ex?.message}`);

                }

            }

		}

	}, [props.paused, props.isLive, props.isDVR]);

	// Usamos useMemo para devolver un objeto estable que no cause re-renders innecesarios
	return pausedSeconds;
}
