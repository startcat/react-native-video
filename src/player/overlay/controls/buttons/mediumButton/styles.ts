import { StyleSheet } from 'react-native';
import { SPACING } from '../../../../theme';

const HEIGHT = 64;

export const styles = StyleSheet.create({
    container:{
        width:HEIGHT,
        height:HEIGHT,
        justifyContent:'center',
        alignItems:'center',
        marginHorizontal:SPACING['1x'],
        alignSelf:'center'
    },
    icon:{
        fontSize:48,
        color:'white',
        textAlign:'center'
    },
    disabled:{
        opacity:0.4
    }
});
