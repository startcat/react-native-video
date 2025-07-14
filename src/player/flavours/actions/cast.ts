import {
    CastSession,
    RemoteMediaClient
} from 'react-native-google-cast';
import {
    type IPlayerMenuData,
    type LiveSeekableCastRange,
    CONTROL_ACTION
} from '../../types';



export const getTrackId = (type:string, index:number, menuData?:Array<IPlayerMenuData>) => {

    let item = menuData?.find(item => item.type === type && item.index === index);

    return item?.id;

}

const mapSeekablePosition = (value:number, liveSeekableRange?:LiveSeekableCastRange | null): number => {

    if (liveSeekableRange && value < liveSeekableRange.startTime){
        return liveSeekableRange.startTime;
    }

    if (liveSeekableRange && value > liveSeekableRange.endTime){
        return liveSeekableRange.endTime;
    }

    return value;

}


/*
 *  Method from Controls
 *
 */

export const invokePlayerAction = async (castClient: RemoteMediaClient | null, castSession: CastSession | null, id: CONTROL_ACTION, value?:any, currentTime?:number, duration?:number, liveSeekableRange?:LiveSeekableCastRange | null, onSeek?:(value) => void) => {

    console.log(`[Player] (Cast Actions) invokePlayerAction: ${id} / ${value}`);

    let position;

    if (castClient && id === CONTROL_ACTION.PAUSE && !value){
        castClient.play();

    } else if (castClient && id === CONTROL_ACTION.PAUSE && value){
        castClient.pause();

    } else if (castSession && id === CONTROL_ACTION.MUTE){
        castSession.setMute(value);

    } else if (castClient && id === CONTROL_ACTION.SEEK && typeof(value) === 'number'){
        position = mapSeekablePosition(value, liveSeekableRange);

    } else if (castClient && id === CONTROL_ACTION.FORWARD && typeof(value) === 'number' && typeof(currentTime) === 'number' && typeof(duration) === 'number'){
        position = mapSeekablePosition((currentTime + value) > duration ? duration : (currentTime + value), liveSeekableRange);

    } else if (castClient && id === CONTROL_ACTION.BACKWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
        position = mapSeekablePosition((currentTime - value) < 0 ? 0 : (currentTime - value), liveSeekableRange);
        
    }

    if (castClient && typeof(position) === 'number'){
        castClient.seek({ position: position });

        if (onSeek){
            onSeek(position);
        }
    }

}

export const changeActiveTracks = async (castClient: RemoteMediaClient | null, menuData?:Array<IPlayerMenuData>, audioIndex?:number, subtitleIndex?:number) => {

    let activeTracks:Array<number> = [];

    console.log(`[DANI] changeActiveTracks - audioIndex: ${audioIndex}, subtitleIndex: ${subtitleIndex}`);
    console.log(`[DANI] changeActiveTracks - castClient: ${!!castClient}, menuData: ${!!menuData}`);
    console.log(`[DANI] changeActiveTracks - menuData: ${JSON.stringify(menuData)}`);

    if (castClient && menuData){

        if (typeof(audioIndex) === 'number'){
            activeTracks.push( getTrackId('audio', audioIndex, menuData)! );
        }
        
        if (typeof(subtitleIndex) === 'number' && subtitleIndex !== -1){
            activeTracks.push( getTrackId('text', subtitleIndex, menuData)! );
        }

        if (activeTracks.length){
            console.log(`[Player] (Cast Actions) changeActiveTracks ${JSON.stringify(activeTracks)}`);
            await castClient.setActiveTrackIds(activeTracks);
        } else {
            console.log(`[Player] (Cast Actions) changeActiveTracks empty ids... ${JSON.stringify(activeTracks)}`);
        }

    } else {
        console.log(`[Player] (Cast Actions) changeActiveTracks without objects: castClient ${!!castClient} / menuData ${!!menuData}`);
    }

}