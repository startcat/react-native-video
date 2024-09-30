import { StyleSheet } from 'react-native';

const HEIGHT = 50;

export const styles = StyleSheet.create({
    container:{
        width:HEIGHT,
        height:HEIGHT,
        justifyContent:'center',
        alignItems:'center',
        alignSelf:'center'
    },
    icon:{
        fontSize:28,
        color:'white',
        textAlign:'center'
    },
    disabled:{
        opacity:0.4
    }
});
