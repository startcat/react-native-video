import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@ui-kitten/components';
import { styles } from './styles';

import { parseToCounter } from '../../../../utils/time';

type Props = {
    value?: number | string;
    align?: 'center' | 'left' | 'right';
    style?: any;
}

export const TimelineText = (props: Props) => {

    const [value, setValue] = useState<number | string | undefined>(props?.value);

    useEffect(() => {
        setValue(props?.value);

    }, [props?.value]);

    if (value && typeof(value) === 'string'){
        return (
            <View style={[styles.container, props?.style]}>
                <Text category='h5' style={styles.text}>{ value }</Text>
            </View>
        );

    } else if (value && typeof(value) === 'number'){
        return (
            <View style={[styles.container, props?.style]}>
                <Text category='h5' style={styles.text}>{ parseToCounter(value) }</Text>
            </View>
        );

    } else {
        return null;

    }

};
