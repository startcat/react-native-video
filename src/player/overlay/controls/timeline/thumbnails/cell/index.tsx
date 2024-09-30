import React, { useEffect, useState } from 'react';
import FastImage from 'react-native-fast-image';
import { View } from 'react-native';
import { Text } from '@ui-kitten/components';

import { parseToCounter } from '../../../../../utils/time';
import { IThumbnailMetadata, IThumbnail } from '../../../../../types';
import { styles } from './styles';


type Props = {
    seconds: number;
    index?: number;
    active?: boolean;
    metadata: IThumbnailMetadata;
    cell_width?: number;
    offset?: number;
}

export const ThumbnailCell = (props: Props) => {

    const [seconds, setSeconds] = useState<number>(props.seconds);
    const [isActive, setIsActive] = useState<boolean>(!!props?.active);
    const [thumbProps, setThumbProps] = useState<IThumbnail>();

    useEffect(() => {
        setSeconds(props.seconds);

    }, [props.seconds]);

    useEffect(() => {
        setIsActive(!!props?.active);

    }, [props.active]);

    useEffect(() => {
        getThumbnailFromMetadata(seconds);

    }, [seconds]);

    const getThumbnailFromMetadata = (seconds: number) => {

        const { tileDuration, thumbnailDuration, url, width, height, imageWidth, imageHeight } = props?.metadata;
        const thumbnailsPerRow = imageWidth / width;

        let effectiveSecond = seconds < 0 ? 0 : seconds;

        const imageGridIndex = Math.floor(effectiveSecond / tileDuration);
        effectiveSecond -= imageGridIndex * tileDuration;
        const gridSecond = effectiveSecond;

        const cellIndex = gridSecond / thumbnailDuration;
        const rowIndex = Math.trunc(cellIndex / thumbnailsPerRow);
        const colIndex = Math.trunc(cellIndex - (thumbnailsPerRow * rowIndex));

        const y = Math.floor(rowIndex * height);
        const x = Math.floor(colIndex * width);

        const proportion = (props?.cell_width) ? props?.cell_width / width : 1;

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

    }

    return (
        <View 
            style={[
                styles.container, 
                isActive ? styles.active : {},
                { aspectRatio: props.metadata.width / props.metadata.height },
                props?.offset ? { left: props.offset } : { left : 0 }
            ]}>

            {
                thumbProps ?
                    <FastImage 
                        style={{
                            ...styles.image, 
                            width: thumbProps?.wrapperWidth,
                            height: thumbProps?.wrapperHeight,
                            top: thumbProps?.y,
                            left: thumbProps?.x
                        }} 
                        source={{ uri: thumbProps?.url }}
                        resizeMode='cover'
                        accessible={false}
                    />
                : null
            }

            {
                isActive ?
                    <Text category='h1' style={styles.title}>{ parseToCounter(props?.seconds) }</Text>
                : null
            }

        </View>
    );

};
