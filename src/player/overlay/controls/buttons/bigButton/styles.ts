import { StyleSheet } from 'react-native';

const HEIGHT = 110;

export const styles = StyleSheet.create({
    container:{
        width:HEIGHT,
        height:HEIGHT,
        justifyContent:'center',
        alignItems:'center',
        alignSelf:'center'
    },
    icon:{
        fontSize:96,
        color:'white',
        textAlign:'center'
    },
    disabled:{
        opacity:0.4
    }
});
