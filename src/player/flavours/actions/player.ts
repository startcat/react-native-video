import { type RefObject } from 'react';
import { type VideoRef } from '../../../Video';
import { CONTROL_ACTION } from '../../types';



/*
 *  Method from Controls
 *
 */

export const invokePlayerAction = async (playerRef:RefObject<VideoRef>, id: CONTROL_ACTION, value?:any, currentTime?:number, duration?:number, seekableRange?:number) => {

    console.log(`[Player] (Actions) invokePlayerAction: ${id} / ${value}`);

    let seekValue;
    const maxSeekRange = Math.max(seekableRange!, duration!);

    console.log(`[Player] (Actions) invokePlayerAction: maxSeekRange ${maxSeekRange} -> ${duration}/${seekableRange}`);

    if (playerRef.current && id === CONTROL_ACTION.SEEK && typeof(value) === 'number'){
        seekValue = value;

    } else if (playerRef.current && id === CONTROL_ACTION.FORWARD && typeof(value) === 'number' && typeof(currentTime) === 'number' && typeof(duration) === 'number'){
        seekValue = (currentTime + value) > maxSeekRange ? maxSeekRange : (currentTime + value);

    } else if (playerRef.current && id === CONTROL_ACTION.BACKWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
        seekValue = Math.max(0, currentTime - value);

    }

    if (typeof(seekValue) === 'number'){
        console.log(`[Player] (Normal Flavour) invokePlayerAction SEEK to ${seekValue} -> ${currentTime}/${duration}/${seekableRange}`);
        // @ts-ignore
        await playerRef.current.seek(seekValue);
    }

}