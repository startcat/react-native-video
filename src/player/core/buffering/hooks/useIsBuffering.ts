/*
 *  HOOK useIsBuffering
 *  Gestión del estado de buffering
 *
 */

import { useCallback, useEffect, useState } from 'react';

interface useIsBufferingProps {
    buffering?: boolean;
    paused?: boolean;
    onBufferingChange?: (value: boolean) => void;
    onStartBuffering?: () => void;
    onEndBuffering?: () => void;
}

export function useIsBuffering(props: useIsBufferingProps) {
    const [isBuffering, setIsBuffering] = useState<boolean>(false);

    const maybeChangeBufferingState = useCallback(() => {
        const newIsBuffering = !!props.buffering && !props.paused;
    
        if (isBuffering !== newIsBuffering) {
            setIsBuffering(newIsBuffering);
    
            // Ejecutar callbacks después de actualizar el estado
            if (newIsBuffering && props.onStartBuffering) {
                props.onStartBuffering();
            }

            if (!newIsBuffering && props.onEndBuffering) {
                props.onEndBuffering();
            }

            if (props.onBufferingChange) {
                props.onBufferingChange(newIsBuffering);
            }
        }
    }, [isBuffering, props.buffering, props.paused, props.onStartBuffering, props.onEndBuffering, props.onBufferingChange]);

    useEffect(() => {
        maybeChangeBufferingState();
    }, [maybeChangeBufferingState]);

    return isBuffering;
}