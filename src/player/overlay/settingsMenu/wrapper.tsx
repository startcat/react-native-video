import React, { useState } from 'react';
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

export function SettingsMenu (props: MenuProps): React.ReactElement {

    const insets = useSafeAreaInsets();
    const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(props.videoIndex || -1);
    const [speedRate, setSpeedRate] = useState<number>(props.speedRate || 1);

    const onPress = (id: CONTROL_ACTION, value?:any) => {

        console.log(`[Settings Menu] onPress ${id} / ${value}`);
        if (id === CONTROL_ACTION.VIDEO_INDEX){
            setSelectedVideoIndex(value);

        } else if (id === CONTROL_ACTION.SPEED_RATE){
            setSpeedRate(value);

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

        if (speedRate !== props.speedRate && props?.onPress && typeof(selectedVideoIndex) === 'number'){
            props?.onPress(CONTROL_ACTION.SPEED_RATE, speedRate);
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
                        key='qualities'
                        style={styles.list}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        stickyHeaderIndices={[0]}
                    >
                        <Header title={i18n.t('player_quality')} />

                        {
                            props.menuData?.filter(item => item.type === 'video').map((item, index) => 
                                <SettingsMenuItem key={`set_${item.type}_${index}`} data={item} selected={item.index === selectedVideoIndex} onPress={onPress} />
                            )
                        }

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

                        {
                            props.menuData?.filter(item => item.type === 'rate').map((item, index) => 
                                <SettingsMenuItem key={`set_${item.type}_${index}_${item.id}`} data={item} selected={item.id == speedRate} onPress={onPress} />
                            )
                        }

                    </ScrollView>

                </View>

                <View style={styles.bottomContents}>
                    <Button style={styles.mainButton} status='basic' onPress={onClose} accessoryLeft={require('~/theme/buttonIcons').icon_cancel} accessibilityRole='button'>{ i18n.t('cancel') }</Button>
                    <Button style={styles.mainButton} status='primary' onPress={onAccept} accessoryLeft={require('~/theme/buttonIcons').icon_ok} accessibilityRole='button'>{ i18n.t('accept') }</Button>
                </View>

            </Pressable>
        </Animated.View>
    );

};
