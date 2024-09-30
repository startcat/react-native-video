import React from 'react';
import { View } from 'react-native';
import { styles } from './styles';

interface Props {
    children?: React.ReactNode | undefined;
}

export const Mosca = (props: Props) => {

    return (
        <View style={styles.container}>
            { props?.children }
        </View>
    );

};
