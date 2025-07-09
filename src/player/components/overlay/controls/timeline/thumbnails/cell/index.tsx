import { Text } from '@ui-kitten/components';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import FastImage from 'react-native-fast-image';

import { parseToCounter } from '../../../../../../utils/time';

import {
    type IThumbnail,
    type ThumbnailCellProps
} from '../../../../../../types';

import { styles } from './styles';

const ThumbnailCellBase = ({
    seconds,
    active,
    offset,
    cell_width,
    metadata
}: ThumbnailCellProps): React.ReactElement => {
    
    const [thumbProps, setThumbProps] = useState<IThumbnail>();
    
    const isActive = useMemo(() => !!active, [active]);
    
    const getThumbnailFromMetadata = useCallback((currentSeconds: number) => {
        const { tileDuration, thumbnailDuration, url, width, height, imageWidth, imageHeight } = metadata;
        const thumbnailsPerRow = imageWidth / width;

        let effectiveSecond = currentSeconds < 0 ? 0 : currentSeconds;

        const imageGridIndex = Math.floor(effectiveSecond / tileDuration);
        effectiveSecond -= imageGridIndex * tileDuration;
        const gridSecond = effectiveSecond;

        const cellIndex = gridSecond / thumbnailDuration;
        const rowIndex = Math.trunc(cellIndex / thumbnailsPerRow);
        const colIndex = Math.trunc(cellIndex - (thumbnailsPerRow * rowIndex));

        const y = Math.floor(rowIndex * height);
        const x = Math.floor(colIndex * width);

        const proportion = cell_width ? cell_width / width : 1;

        setThumbProps({
            gridSecond,
            url: url.replace("{{index}}", (imageGridIndex + 1).toString()),
            x: -1 * proportion * x,
            y: -1 * proportion * y,
            width,
            height,
            imageWidth,
            imageHeight,
            wrapperWidth: proportion * imageWidth,
            wrapperHeight: proportion * imageHeight
        });
    }, [metadata, cell_width]);

    useEffect(() => {
        getThumbnailFromMetadata(seconds);
    }, [seconds, getThumbnailFromMetadata]);
    
    const containerStyle = useMemo(() => [
        styles.container, 
        isActive ? styles.active : {},
        { aspectRatio: metadata.width / metadata.height },
        offset ? { left: offset } : { left: 0 }
    ], [isActive, metadata.width, metadata.height, offset]);
    
    const imageStyle = useMemo(() => thumbProps ? {
        ...styles.image, 
        width: thumbProps.wrapperWidth,
        height: thumbProps.wrapperHeight,
        top: thumbProps.y,
        left: thumbProps.x
    } : {}, [thumbProps]);
    
    const timeText = useMemo(() => parseToCounter(seconds), [seconds]);
    
    return (
        <View style={containerStyle}>
            {thumbProps && (
                <FastImage 
                    style={imageStyle} 
                    source={{ uri: thumbProps.url }}
                    resizeMode='cover'
                    accessible={false}
                />
            )}
            
            {isActive && (
                <Text category='h1' style={styles.title}>{timeText}</Text>
            )}
        </View>
    );
};

const arePropsEqual = (prevProps: ThumbnailCellProps, nextProps: ThumbnailCellProps): boolean => {
    return (
        prevProps.seconds === nextProps.seconds &&
        prevProps.active === nextProps.active &&
        prevProps.offset === nextProps.offset &&
        prevProps.cell_width === nextProps.cell_width &&
        prevProps.metadata === nextProps.metadata
    );
};

export const ThumbnailCell = React.memo(ThumbnailCellBase, arePropsEqual);
