import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@ui-kitten/components';
import { styles } from './styles';
import { parseToCounter } from '../../../../utils/time';
import {
    type TimelineTextProps
} from '../../../../types';

export function TimelineText (props: TimelineTextProps): React.ReactElement | null {

    const [value, setValue] = useState<number | string | undefined>(props?.value);

    useEffect(() => {
        setValue(props?.value);

    }, [props?.value]);

    if (value && typeof(value) === 'string'){
        return (
            <View style={[styles.container, props?.containerStyle]}>
                <Text category='h5' style={[styles.text, props?.textStyle]}>{ value }</Text>
            </View>
        );

    } else if (value && typeof(value) === 'number'){
        return (
            <View style={[styles.container, props?.containerStyle]}>
                <Text category='h5' style={[styles.text, props?.textStyle]}>{ parseToCounter(value) }</Text>
            </View>
        );

    } else {
        return null;

    }

};
