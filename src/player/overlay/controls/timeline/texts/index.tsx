import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '@ui-kitten/components';
import { styles } from './styles';
import { parseToCounter } from '../../../../utils/time';
import {
    type TimelineTextProps
} from '../../../../types';

const TimelineTextBase = ({
    value,
    category = 'h5',
    containerStyle,
    textStyle
}: TimelineTextProps): React.ReactElement | null => {

    // Determinar el contenido del texto basado en el tipo de valor
    const textContent = useMemo(() => {
        if (value === undefined || value === null) {
            return null;
        }
        
        if (typeof value === 'string') {
            return value;
        }
        
        if (typeof value === 'number') {
            return parseToCounter(value);
        }
        
        return null;
    }, [value]);

    // Si no hay contenido, no renderizar nada
    if (textContent === null) {
        return null;
    }

    return (
        <View style={[styles.container, containerStyle]}>
            <Text category={category} style={[styles.text, textStyle]}>
                {textContent}
            </Text>
        </View>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: TimelineTextProps, nextProps: TimelineTextProps): boolean => {
    return (
        prevProps.value === nextProps.value &&
        prevProps.category === nextProps.category &&
        prevProps.containerStyle === nextProps.containerStyle &&
        prevProps.textStyle === nextProps.textStyle
    );
};

export const TimelineText = React.memo(TimelineTextBase, arePropsEqual);
