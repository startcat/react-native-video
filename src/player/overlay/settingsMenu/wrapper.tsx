import React, { useState, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Button } from '@ui-kitten/components';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { i18n } from '../../locales';
import { SettingsMenuItem } from './item';
import { 
    type MenuProps,
    CONTROL_ACTION 
} from '../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

const Header = ({ title }: { title: string }) => (
    <Text category='h1' style={styles.title}>{title}</Text>
);

const SettingsMenuBase = ({
    menuData,
    videoIndex = -1,
    speedRate = 1,
    onPress: propOnPress,
    onClose: propOnClose
}: MenuProps): React.ReactElement => {

    const insets = useSafeAreaInsets();
    const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(videoIndex);
    const [selectedSpeedRate, setSelectedSpeedRate] = useState<number>(speedRate);

    const handlePress = useCallback((id: CONTROL_ACTION, value?: any) => {
        console.log(`[Settings Menu] onPress ${id} / ${value}`);
        if (id === CONTROL_ACTION.VIDEO_INDEX) {
            setSelectedVideoIndex(value);
        } else if (id === CONTROL_ACTION.SPEED_RATE) {
            setSelectedSpeedRate(value);
        }
    }, []);

    const handleClose = useCallback(() => {
        if (typeof propOnPress === 'function') {
            propOnPress(CONTROL_ACTION.MENU_CLOSE);
        }
    }, [propOnPress]);

    const handleAccept = useCallback(() => {
        if (typeof propOnPress === 'function') {
            if (selectedVideoIndex !== videoIndex && typeof selectedVideoIndex === 'number') {
                propOnPress(CONTROL_ACTION.VIDEO_INDEX, selectedVideoIndex);
            }
            
            if (selectedSpeedRate !== speedRate && typeof selectedVideoIndex === 'number') {
                propOnPress(CONTROL_ACTION.SPEED_RATE, selectedSpeedRate);
            }
        }
        
        handleClose();
    }, [propOnPress, selectedVideoIndex, selectedSpeedRate, videoIndex, speedRate, handleClose]);

    const containerStyle = useMemo(() => ({
        ...styles.fill,
        paddingTop: insets.top,
        paddingHorizontal: Math.max(insets.left, insets.right),
        paddingBottom: insets.bottom
    }), [insets.top, insets.left, insets.right, insets.bottom]);

    const videoItems = useMemo(() => 
        menuData?.filter(item => item.type === 'video') || []
    , [menuData]);
    
    const rateItems = useMemo(() => 
        menuData?.filter(item => item.type === 'rate') || []
    , [menuData]);

    const handleCloseWrapper = useCallback(() => {
        if (typeof propOnClose === 'function') {
            propOnClose();
        } else {
            handleClose();
        }
    }, [propOnClose, handleClose]);

    return (
        <Animated.View 
            style={styles.container}
            entering={SlideInDown.duration(ANIMATION_SPEED)}
            exiting={SlideOutDown.duration(ANIMATION_SPEED)}
        >
            <Pressable
                style={containerStyle}
                onPress={handleCloseWrapper}
            >
                <View style={styles.upperContents}>
                    <ScrollView 
                        key='qualities'
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >
                        <Header title={i18n.t('player_quality')} />
                        {videoItems.map((item, index) => (
                            <SettingsMenuItem 
                                key={`set_${item.type}_${index}`} 
                                data={item} 
                                selected={item.index === selectedVideoIndex} 
                                onPress={handlePress} 
                            />
                        ))}
                    </ScrollView>

                    <View style={styles.listsDivider} />

                    <ScrollView 
                        key='rates'
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >
                        <Header title={i18n.t('player_speed')} />
                        {rateItems.map((item, index) => (
                            <SettingsMenuItem 
                                key={`set_${item.type}_${index}_${item.id}`} 
                                data={item} 
                                selected={item.id === selectedSpeedRate} 
                                onPress={handlePress} 
                            />
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.bottomContents}>
                    <Button 
                        style={styles.mainButton} 
                        status='basic' 
                        onPress={handleClose} 
                        accessibilityRole='button'
                    >
                        {i18n.t('cancel')}
                    </Button>
                    <Button 
                        style={styles.mainButton} 
                        status='primary' 
                        onPress={handleAccept} 
                        accessibilityRole='button'
                    >
                        {i18n.t('accept')}
                    </Button>
                </View>
            </Pressable>
        </Animated.View>
    );
};

const arePropsEqual = (prevProps: MenuProps, nextProps: MenuProps): boolean => {
    return (
        prevProps.videoIndex === nextProps.videoIndex &&
        prevProps.speedRate === nextProps.speedRate &&
        prevProps.onPress === nextProps.onPress &&
        prevProps.onClose === nextProps.onClose &&
        prevProps.menuData === nextProps.menuData
    );
};

export const SettingsMenu = React.memo(SettingsMenuBase, arePropsEqual);

// También exportamos como default para importar con lazy
export default SettingsMenu;
