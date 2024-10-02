import React from 'react';
import { View, Image } from 'react-native';
import {
    type BackgroundPosterProps
} from '../../types';
import { styles } from './styles';

export function BackgroundPoster (props: BackgroundPosterProps): React.ReactElement {

    return (
        <View style={styles.container}>
            {
                props?.poster ?
                    <Image style={styles.posterImage} resizeMode='cover' source={{uri:encodeURI(`${props?.poster}`)}} blurRadius={5} />
                : null
            }

            { props?.children }
        </View>
    );
};