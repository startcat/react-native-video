import React, { useState } from 'react';
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

export function Menu (props: MenuProps): React.ReactElement {

    const insets = useSafeAreaInsets();
    const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(props.videoIndex || 0);
    const [selectedAudioIndex, setSelectedAudioIndex] = useState<number>(props.audioIndex || 0);
    const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number>(typeof(props.subtitleIndex) === 'number' ? props.subtitleIndex : -1);

    const onPress = (id: CONTROL_ACTION, value?:any) => {

        if (id === CONTROL_ACTION.VIDEO_INDEX){
            setSelectedVideoIndex(value);

        } else if (id === CONTROL_ACTION.AUDIO_INDEX){
            setSelectedAudioIndex(value);

        } else if (id === CONTROL_ACTION.SUBTITLE_INDEX){
            setSelectedSubtitleIndex(value);

        }

    }

    const onClose = () => {

        if (props?.onPress){
            props?.onPress(CONTROL_ACTION.MENU_CLOSE);
        }
        
    }

    const onAccept = () => {

        if (selectedVideoIndex !== props.videoIndex && props?.onPress && typeof(selectedVideoIndex) === 'number'){
            props?.onPress(CONTROL_ACTION.VIDEO_INDEX, selectedVideoIndex);
        }

        if (selectedAudioIndex !== props.audioIndex && props?.onPress && typeof(selectedAudioIndex) === 'number'){
            props?.onPress(CONTROL_ACTION.AUDIO_INDEX, selectedAudioIndex);
        }

        if (selectedSubtitleIndex !== props.subtitleIndex && props?.onPress && typeof(selectedSubtitleIndex) === 'number'){
            props?.onPress(CONTROL_ACTION.SUBTITLE_INDEX, selectedSubtitleIndex);
        }

        onClose();

    }

    const Header = (props:{title:string}) => (
        <Text category='h1' style={styles.title}>{ props.title }</Text>
    )

    return (
        <Animated.View 
            style={styles.container}
            entering={SlideInDown.duration(ANIMATION_SPEED)}
            exiting={SlideOutDown.duration(ANIMATION_SPEED)}
        >
            <Pressable
                style={{
                    ...styles.fill,
                    paddingTop:insets.top,
                    paddingHorizontal:Math.max(insets.left, insets.right),
                    paddingBottom:insets.bottom
                }}
                onPress={props?.onClose}
            >

                <View style={styles.upperContents}>

                    <ScrollView 
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >

                        <Header title={i18n.t('player_subtitles')} />

                        {
                            props.menuData?.filter(item => item.type === 'text').map((item, index) => 
                                <MenuItem key={`${item.type}_${index}`} data={item} selected={item.index === selectedSubtitleIndex} onPress={onPress} />
                            )
                        }

                    </ScrollView>

                    <View style={styles.listsDivider} />

                    <ScrollView 
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >

                        <Header title={i18n.t('player_audio')} />

                        {
                            props.menuData?.filter(item => item.type === 'audio').map((item, index) => 
                                <MenuItem key={`${item.type}_${index}`} data={item} selected={item.index === selectedAudioIndex} onPress={onPress} />
                            )
                        }

                    </ScrollView>

                </View>

                <View style={styles.bottomContents}>
                    <Button style={styles.mainButton} status='basic' onPress={onClose} accessibilityRole='button'>{ i18n.t('cancel') }</Button>
                    <Button style={styles.mainButton} status='primary' onPress={onAccept} accessibilityRole='button'>{ i18n.t('accept') }</Button>
                </View>

            </Pressable>
        </Animated.View>
    );

};
