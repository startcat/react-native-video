import { type RefObject } from 'react';
import { type VideoRef } from '../../../Video';
import { CONTROL_ACTION } from '../../types';



/*
 *  Method from Controls
 *
 */

export const invokePlayerAction = async (playerRef:RefObject<VideoRef>, id: CONTROL_ACTION, value?:any, currentTime?:number, duration?:number) => {

    console.log(`[Player] (Actions) invokePlayerAction: ${id} / ${value}`);

    let seekValue;

    if (playerRef.current && id === CONTROL_ACTION.SEEK && typeof(value) === 'number'){
        seekValue = value;
        // await playerRef.current.seek(value);

    } else if (playerRef.current && id === CONTROL_ACTION.FORWARD && typeof(value) === 'number' && typeof(currentTime) === 'number' && typeof(duration) === 'number'){
        seekValue = (currentTime + value) > duration ? duration : (currentTime + value);
        // await playerRef.current.seek((currentTime + value) > duration ? duration : (currentTime + value));

    } else if (playerRef.current && id === CONTROL_ACTION.BACKWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
        seekValue = (currentTime - value) < 0 ? 0 : (currentTime - value);
        // await playerRef.current.seek((currentTime - value) < 0 ? 0 : (currentTime - value));

    }

    if (typeof(seekValue) === 'number'){
        console.log(`[Player] (Normal Flavour) invokePlayerAction SEEK to ${seekValue} -> ${currentTime}/${duration}`);
        // @ts-ignore
        await playerRef.current.seek(seekValue);
    }

}