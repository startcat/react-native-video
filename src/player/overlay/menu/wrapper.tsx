import React, { useState, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Button } from '@ui-kitten/components';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { i18n } from '../../locales';
import { MenuItem } from './item';
import { 
    type MenuProps,
    CONTROL_ACTION 
} from '../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

const Header = ({ title }: { title: string }) => (
    <Text category='h1' style={styles.title}>{title}</Text>
);

const MenuBase = ({
    menuData,
    videoIndex = 0,
    audioIndex = 0,
    subtitleIndex,
    onPress: propOnPress,
    onClose: propOnClose
}: MenuProps): React.ReactElement => {

    const insets = useSafeAreaInsets();
    const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(videoIndex);
    const [selectedAudioIndex, setSelectedAudioIndex] = useState<number>(audioIndex);
    const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(
        typeof subtitleIndex === 'number' ? subtitleIndex : -1
    );

    const handlePress = useCallback((id: CONTROL_ACTION, value?: any) => {
        if (id === CONTROL_ACTION.VIDEO_INDEX) {
            setSelectedVideoIndex(value);
        } else if (id === CONTROL_ACTION.AUDIO_INDEX) {
            setSelectedAudioIndex(value);
        } else if (id === CONTROL_ACTION.SUBTITLE_INDEX) {
            setSelectedSubtitleIndex(value);
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
            
            if (selectedAudioIndex !== audioIndex && typeof selectedAudioIndex === 'number') {
                propOnPress(CONTROL_ACTION.AUDIO_INDEX, selectedAudioIndex);
            }
            
            if (selectedSubtitleIndex !== subtitleIndex && typeof selectedSubtitleIndex === 'number') {
                propOnPress(CONTROL_ACTION.SUBTITLE_INDEX, selectedSubtitleIndex);
            }
        }
        
        handleClose();
    }, [propOnPress, selectedVideoIndex, selectedAudioIndex, selectedSubtitleIndex, videoIndex, audioIndex, subtitleIndex, handleClose]);

    const containerStyle = useMemo(() => ({
        ...styles.fill,
        paddingTop: insets.top,
        paddingHorizontal: Math.max(insets.left, insets.right),
        paddingBottom: insets.bottom
    }), [insets.top, insets.left, insets.right, insets.bottom]);

    const subtitleItems = useMemo(() => 
        menuData?.filter(item => item.type === 'text') || []
    , [menuData]);
    
    const audioItems = useMemo(() => 
        menuData?.filter(item => item.type === 'audio') || []
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
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >
                        <Header title={i18n.t('player_subtitles')} />
                        {subtitleItems.map((item, index) => (
                            <MenuItem 
                                key={`${item.type}_${index}`} 
                                data={item} 
                                selected={item.index === selectedSubtitleIndex} 
                                onPress={handlePress} 
                            />
                        ))}
                    </ScrollView>

                    <View style={styles.listsDivider} />

                    <ScrollView 
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >
                        <Header title={i18n.t('player_audio')} />
                        {audioItems.map((item, index) => (
                            <MenuItem 
                                key={`${item.type}_${index}`} 
                                data={item} 
                                selected={item.index === selectedAudioIndex} 
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
        prevProps.audioIndex === nextProps.audioIndex &&
        prevProps.subtitleIndex === nextProps.subtitleIndex &&
        prevProps.onPress === nextProps.onPress &&
        prevProps.onClose === nextProps.onClose &&
        prevProps.menuData === nextProps.menuData
    );
};

export const Menu = React.memo(MenuBase, arePropsEqual);

// También exportamos como default para importar con lazy
export default Menu;