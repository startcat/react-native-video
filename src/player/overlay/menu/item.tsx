import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { TouchableOpacity } from 'react-native';
import { Text, Icon } from '@ui-kitten/components';
import { i18n } from '../../locales';
import { 
    type MenuItemProps,
    CONTROL_ACTION
} from '../../types';
import { styles } from './styles';

const MenuItemBase = ({
    data,
    selected,
    onPress: propOnPress
}: MenuItemProps): React.ReactElement => {
    
    const accessibilityLabel = useRef<string>('');
    const controlActionId = useRef<CONTROL_ACTION>(CONTROL_ACTION.SUBTITLE_INDEX);
    
    useEffect(() => {
        if (data?.type === 'audio') {
            accessibilityLabel.current = `${i18n.t('player_audio')} ${data?.label}`;
            controlActionId.current = CONTROL_ACTION.AUDIO_INDEX;
        } else if (data?.type === 'text') {
            accessibilityLabel.current = `${i18n.t('player_subtitles')} ${data?.label}`;
            controlActionId.current = CONTROL_ACTION.SUBTITLE_INDEX;
        }
    }, [data]);
    
    const handlePress = useCallback(() => {
        if (typeof propOnPress === 'function') {
            propOnPress(controlActionId.current, data.index);
        }
    }, [propOnPress, data.index]);
    
    const isSelected = useMemo(() => !!selected, [selected]);
    
    return (
        <TouchableOpacity
            style={styles.menuItem}
            accessible={true}
            accessibilityRole='switch'
            accessibilityLabel={accessibilityLabel.current}
            accessibilityState={{ checked: isSelected }}
            onPress={handlePress}
        >
            {isSelected && (
                <Icon style={styles.menuItemIcon} name='checkmark-outline' />
            )}
            
            <Text category='p1' style={styles.menuItemTitle}>{data?.label}</Text>
        </TouchableOpacity>
    );
};

const arePropsEqual = (prevProps: MenuItemProps, nextProps: MenuItemProps): boolean => {
    return (
        prevProps.selected === nextProps.selected &&
        prevProps.onPress === nextProps.onPress &&
        prevProps.data?.index === nextProps.data?.index &&
        prevProps.data?.label === nextProps.data?.label &&
        prevProps.data?.type === nextProps.data?.type
    );
};

export const MenuItem = React.memo(MenuItemBase, arePropsEqual);
