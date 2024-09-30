import React, { useEffect, useRef } from 'react';
import { TouchableOpacity } from 'react-native';
import { Text, Icon } from '@ui-kitten/components';
import { i18n } from '../../locales';
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

export const SettingsMenuItem = (props: Props) => {

    const accessibilityLabel = useRef<string>();
    const controlActionId = useRef<CONTROL_ACTION>(CONTROL_ACTION.VIDEO_INDEX);

    useEffect(() => {

        if (props.data?.type === 'video'){
            accessibilityLabel.current = `${i18n.t('player_quality')} ${props.data?.label}`;
            controlActionId.current = CONTROL_ACTION.VIDEO_INDEX;

        } else if (props.data?.type === 'rate'){
            accessibilityLabel.current = `${i18n.t('player_speed')} ${props.data?.label}`;
            controlActionId.current = CONTROL_ACTION.SPEED_RATE;

        }

    }, []);

    const onPress = () => {

        if (props.onPress){

            if (controlActionId.current === CONTROL_ACTION.SPEED_RATE){
                props.onPress(controlActionId.current, props.data.id);

            } else {
                props.onPress(controlActionId.current, props.data.index);

            }
            
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

            <Text category='p2' style={styles.menuItemTitle}>{ props.data?.label }</Text>

        </TouchableOpacity>
    );

};
