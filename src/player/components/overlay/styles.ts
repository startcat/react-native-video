import { StyleSheet } from 'react-native';
import { SPACING } from '../../theme';

export const styles = StyleSheet.create({
    container:{
        position:'absolute',
        top:0,
        right:0,
        bottom:0,
        left:0,
    },
    temporalButtonsBar:{
        position:'absolute',
        bottom:SPACING['1x'],
        right:SPACING['1x'],
        left:SPACING['1x'],
    }
});
