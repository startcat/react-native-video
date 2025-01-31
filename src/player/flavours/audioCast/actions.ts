import { 
    RemoteMediaClient,
    CastSession
} from 'react-native-google-cast';
import { 
    type IPlayerMenuData,
    CONTROL_ACTION 
} from '../../types';



const getTrackId = (type:string, index:number, menuData?:Array<IPlayerMenuData>) => {

    let item = menuData?.find(item => item.type === type && item.index === index);

    return item?.id;

}



/*
 *  Method from Controls
 *
 */

export const invokePlayerAction = async (castClient: RemoteMediaClient | null, castSession: CastSession | null, id: CONTROL_ACTION, value?:any, currentTime?:number, isLive?:boolean, menuData?:Array<IPlayerMenuData>) => {

    console.log(`[Player] (Audio Cast Actions) invokePlayerAction: ${id} / ${value}`);

    if (castClient && id === CONTROL_ACTION.PAUSE && !value){
        castClient.play();

    } else if (castClient && id === CONTROL_ACTION.PAUSE && value){
        castClient.pause();

    } else if (castSession && id === CONTROL_ACTION.MUTE){
        castSession.setMute(value);

    } else if (castClient && id === CONTROL_ACTION.SEEK && typeof(value) === 'number'){
        castClient.seek({ position: value });

    } else if (castClient && id === CONTROL_ACTION.FORWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
        castClient.seek({ position: currentTime + value });

    } else if (castClient && id === CONTROL_ACTION.BACKWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
        castClient.seek({ position: currentTime - value });        

    }

}

export const changeActiveTracks = async (castClient: RemoteMediaClient | null, menuData?:Array<IPlayerMenuData>, audioIndex?:number, subtitleIndex?:number) => {

    let activeTracks:Array<number> = [];

    if (castClient && menuData){

        if (typeof(audioIndex) === 'number' && audioIndex !== -1){
            activeTracks.push( getTrackId('audio', audioIndex, menuData)! );
        }
        
        if (typeof(subtitleIndex) === 'number' && subtitleIndex !== -1){
            activeTracks.push( getTrackId('text', subtitleIndex, menuData)! );
        }

        if (activeTracks.length){
            console.log(`[Player] (Audio Cast Actions) changeActiveTracks ${JSON.stringify(activeTracks)}`);
            await castClient.setActiveTrackIds(activeTracks);
        } else {
            console.log(`[Player] (Audio Cast Actions) changeActiveTracks empty ids... ${JSON.stringify(activeTracks)}`);
        }

    } else {
        console.log(`[Player] (Audio Cast Actions) changeActiveTracks without objects: castClient ${!!castClient} / menuData ${!!menuData}`);
    }

}