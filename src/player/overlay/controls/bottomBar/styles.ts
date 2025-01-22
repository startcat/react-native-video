import { StyleSheet } from 'react-native';

const HEIGHT = 50;

export const styles = StyleSheet.create({
    container:{
        flexDirection:'row',
        height:HEIGHT,
        justifyContent:'space-between',
    },
    left:{
        height:HEIGHT,
        flexDirection:'row',
        justifyContent:'center',
        alignContent:'center',
        zIndex:5
    },
    middle:{
        height:HEIGHT,
        justifyContent:'center',
        position:'absolute',
        top:0,
        left:0,
        right:0,
        bottom:0
    },
    right:{
        height:HEIGHT,
        flexDirection:'row',
        zIndex:5
    },
    title:{
        textAlign:'center',
        color:'white',
        paddingHorizontal:160
    },
});
