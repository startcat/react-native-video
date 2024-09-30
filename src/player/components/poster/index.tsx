import React from 'react';
import { View, Image } from 'react-native';
import { styles } from './styles';

interface Props {
    poster?: string;
    children?: React.ReactNode | undefined;
}

export const BackgroundPoster = (props: Props) => {

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