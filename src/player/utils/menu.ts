import { i18n } from 'locales';

import { 
    OnLoadData
} from 'react-native-video';

import { 
    MediaTrack
} from 'react-native-google-cast';

import { 
    ILanguagesMapping,
    IPlayerMenuData
} from '../types';

const sortByIndex = (a: IPlayerMenuData, b: IPlayerMenuData) => {

    if (a.type < b.type){
        return -1;

    } else if (a.type > b.type){
        return 1;

    } else {

        if (a.index < b.index){
            return -1;

        } else if (a.index > b.index){
            return 1;

        } else {
            return 0;

        }

    }

}

export const mergeMenuData = (loadedData: OnLoadData, languagesMapping?:ILanguagesMapping, hlsQualities?:Array<IPlayerMenuData>):Array<IPlayerMenuData> => {

    let menuData:Array<IPlayerMenuData> = [];

    // Añadimos las velocidades manualmente
    menuData.push({
        type: 'rate',
        index: 0,
        id:0.25,
        label: '0.25x'
    });

    menuData.push({
        type: 'rate',
        index: 1,
        id:0.5,
        label: '0.5x'
    });

    menuData.push({
        type: 'rate',
        index: 2,
        id:1,
        label: 'Normal'
    });

    menuData.push({
        type: 'rate',
        index: 3,
        id:1.5,
        label: '1.5x'
    });

    menuData.push({
        type: 'rate',
        index: 4,
        id:2,
        label: '2x'
    });

    if (hlsQualities && hlsQualities.length > 0){
        // Añadimos las cualidades del HLS
        menuData = menuData.concat(hlsQualities);

    } else {
        // Añadimos una opción de calidad que indique "Auto"
        menuData.push({
            type: 'video',
            index: -1,
            code: 'none',
            label: i18n.t('player_quality_auto')
        });

        if (loadedData.videoTracks){
            loadedData.videoTracks.forEach(item => {

                menuData.push({
                    type: 'video',
                    index: item.index,
                    label: `${item.height}p`
                });

            });
        }

    }

    if (loadedData.audioTracks){
        loadedData.audioTracks.forEach(item => {

            menuData.push({
                type: 'audio',
                index: item.index,
                code: item.language,
                label: (languagesMapping && item.language && languagesMapping[item.language]) ? languagesMapping[item.language] : item.title || item.index.toString()
            });

        });
    }

    // Añadimos una opción de subtítulo que indique "Ninguno"
    menuData.push({
        type: 'text',
        index: -1,
        code: 'none',
        label: i18n.t('language_none')
    });

    if (loadedData.textTracks){
        loadedData.textTracks.forEach(item => {

            menuData.push({
                type: 'text',
                index: item.index,
                code: item.language,
                label: (languagesMapping && item.language && languagesMapping[item.language]) ? languagesMapping[item.language] : item.title || item.index.toString()
            });

        });
    }

    menuData = menuData.sort(sortByIndex);

    console.log(`[mergeMenuData] ${JSON.stringify(menuData)}`);

    return menuData;

}

export const mergeCastMenuData = (loadedData: Array<MediaTrack> | undefined, languagesMapping?:ILanguagesMapping):Array<IPlayerMenuData> => {

    let menuData:Array<IPlayerMenuData> = [],
        totalAudios = 0,
        totalTexts = 0;

    menuData.push({
        type: 'text',
        index: -1,
        code: 'none',
        label: i18n.t('language_none')
    });

    if (loadedData && loadedData.length){

        loadedData?.forEach(item => {

            if (item.type === 'audio' && item.language !== 'un'){

                menuData.push({
                    type: 'audio',
                    id: item.id,
                    index: totalAudios,
                    code: item.language,
                    label: (languagesMapping && item.language && languagesMapping[item.language]) ? languagesMapping[item.language] : item.name || item.id.toString()
                });

                totalAudios++;

            } else if (item.type === 'text'){

                menuData.push({
                    type: 'text',
                    id: item.id,
                    index: totalTexts,
                    code: item.language,
                    label: (languagesMapping && item.language && languagesMapping[item.language]) ? languagesMapping[item.language] : item.name || item.id.toString()
                });

                totalTexts++;

            }

        });

    }

    menuData = menuData.sort(sortByIndex);

    console.log(`[mergeMenuData] ${JSON.stringify(menuData)}`);

    return menuData;

}