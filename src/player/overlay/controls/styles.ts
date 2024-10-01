import { StyleSheet } from 'react-native';
import { SPACING } from '../../theme';

export const styles = StyleSheet.create({
    container:{
        flex:1,
        position:'relative',
    },
    bottom:{
        position:'absolute',
        bottom:SPACING['0.5x'],
        left:SPACING['0.5x'],
        right:SPACING['0.5x'],
        flexDirection:'column-reverse',
    },
    mask:{
        position:'absolute',
        top:0,
        bottom:0,
        left:0,
        right:0,
        opacity:0.5,
        backgroundColor:'black'
    },
    floatingHeader:{
        position:'absolute',
        top:SPACING['0.5x'],
        left:SPACING['0.5x'] + 50,
    },
    otherButtons:{
        flex:1,
        flexDirection:'row',
        marginBottom:SPACING['0.5x']
    }
});
