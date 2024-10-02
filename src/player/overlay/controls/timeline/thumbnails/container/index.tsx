import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThumbnailCell } from '../cell';
import { 
    type ThumbnailsContainerProps 
} from '../../../../../types';
import { styles } from './styles';

type InnerViewProps = {
    sideNumberOfCells: number;
    numberOfCells: number;
    container_width: number;
    container_height: number;
    cellWidth: number;
    offset?: number;
}

const ANIMATION_SPEED = 150;

export function ThumbnailsContainer (props: ThumbnailsContainerProps): React.ReactElement {

    const [mainSecondsPoint, setMainSecondsPoint] = useState<number | undefined>(props?.seconds);
    const [secondsArray, setSecondsArray] = useState<Array<number>>([]);
    const [viewProps, setViewProps] = useState<InnerViewProps>();

    useEffect(() => {
        setMainSecondsPoint(props?.seconds);

    }, [props?.seconds]);

    useEffect(() => {
        generateSecondsArrayList();

    }, [mainSecondsPoint, viewProps]);

    const generateSecondsArrayList = () => {

        if (viewProps?.sideNumberOfCells && viewProps?.sideNumberOfCells > 0 && props?.metadata?.thumbnailDuration && typeof(mainSecondsPoint) === 'number'){

            let secondsArr:Array<number> = [];

            // 1 image every 10 seconds (thumbnail_duration)

            // Celdas de la izquierda
            for (let index = Math.ceil(viewProps.sideNumberOfCells); index > 0; index--){
                secondsArr.push(mainSecondsPoint - (index * props?.metadata?.thumbnailDuration));

            }

            // Celda principal
            secondsArr.push(mainSecondsPoint);

            // Celdas de la derecha
            for (let index = 1; index <= Math.ceil(viewProps.sideNumberOfCells); index++){
                secondsArr.push(mainSecondsPoint + (index * props?.metadata?.thumbnailDuration));

            }

            console.log(`[Thumbnails Container] secondsArr ${JSON.stringify(secondsArr)}`);
            setSecondsArray(secondsArr);

        } else {
            console.log(`[Thumbnails Container] secondsArr nothing`);
        }

    }

    const onLayout = (e: LayoutChangeEvent) => {

        if (!viewProps || (e.nativeEvent?.layout?.width && viewProps.container_width !== e.nativeEvent?.layout?.width)){

            const imageAspectRatio = props.metadata.width / props.metadata.height;
            const cellWidth = imageAspectRatio * e.nativeEvent?.layout?.height;

            const sideNumberOfCells = ((e.nativeEvent?.layout?.width - cellWidth) / 2) / cellWidth;
            const numberOfCells = (2 * Math.ceil(sideNumberOfCells)) + 1;

            let offset = (e.nativeEvent?.layout?.width - (numberOfCells * cellWidth)) / 2;

            if (offset > 0){
                offset = -1 * offset;

            }

            setViewProps({
                sideNumberOfCells,
                numberOfCells,
                container_width: e.nativeEvent?.layout?.width,
                container_height: e.nativeEvent?.layout?.height,
                cellWidth,
                offset
            });

        }

    };

    return (
        <Animated.View
            style={[
                styles.container,
                props.style,
            ]} 
            onLayout={onLayout}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >

            {
                viewProps?.numberOfCells && viewProps?.numberOfCells > 0 && secondsArray?.length > 0 ?
                    secondsArray?.map((item, index) => 
                        <ThumbnailCell 
                            key={index} 
                            seconds={item} 
                            index={index}
                            active={index === Math.trunc(secondsArray?.length / 2)} 
                            metadata={props.metadata}
                            cell_width={viewProps?.cellWidth}
                            offset={viewProps?.offset}
                            
                        />)
                : null
            }

        </Animated.View>
    );

};
