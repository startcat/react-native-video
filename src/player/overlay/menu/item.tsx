import React, { useEffect, useRef } from 'react';
import { TouchableOpacity } from 'react-native';
import { Text, Icon } from '@ui-kitten/components';
import { i18n } from 'locales';
import { 
    IPlayerMenuData,
    CONTROL_ACTION
} from '../../types';
import { styles } from './styles';

interface Props {
    data: IPlayerMenuData;
    selected?: boolean;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
}

export const MenuItem = (props: Props) => {

    const accessibilityLabel = useRef<string>();
    const controlActionId = useRef<CONTROL_ACTION>(CONTROL_ACTION.SUBTITLE_INDEX);

    useEffect(() => {

        if (props.data?.type === 'audio'){
            accessibilityLabel.current = `${i18n.t('player_audio')} ${props.data?.label}`;
            controlActionId.current = CONTROL_ACTION.AUDIO_INDEX;

        } else if (props.data?.type === 'text'){
            accessibilityLabel.current = `${i18n.t('player_subtitles')} ${props.data?.label}`;
            controlActionId.current = CONTROL_ACTION.SUBTITLE_INDEX;

        }

    }, []);

    const onPress = () => {

        if (props.onPress){
            props.onPress(controlActionId.current, props.data.index);
        }

    }

    return (
        <TouchableOpacity
            style={styles.menuItem}
            accessible={true}
            accessibilityRole='switch'
            accessibilityLabel={accessibilityLabel.current}
            accessibilityState={{checked: !!props.selected}}
            onPress={onPress}
        >

            {
                props.selected ?
                    <Icon style={styles.menuItemIcon} name='checkmark-outline' />
                : null
            }

            <Text category='p1' style={styles.menuItemTitle}>{ props.data?.label }</Text>

        </TouchableOpacity>
    );

};
