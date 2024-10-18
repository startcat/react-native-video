import { StyleSheet } from 'react-native';
import { SPACING } from '../../theme';

export const styles = StyleSheet.create({
    container:{
        backgroundColor:'transparent',
        overflow:'hidden'
    },
    contents:{
        flex:1,
        margin:SPACING['0.5x'],
        justifyContent:'center',
        alignItems:'center'
    },
});
