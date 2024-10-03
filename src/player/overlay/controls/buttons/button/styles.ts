import { StyleSheet } from 'react-native';

// Defaults to small

const BIG_SIZE = 110;
const MEDIUM_SIZE = 64;
const SMALL_SIZE = 50;

const ICON_BIG_SIZE = 96;
const ICON_MEDIUM_SIZE = 48;
const ICON_SMALL_SIZE = 28;

export const styles = StyleSheet.create({
    container:{
        width:SMALL_SIZE,
        height:SMALL_SIZE,
        justifyContent:'center',
        alignItems:'center',
        alignSelf:'center'
    },
    big:{
        width:BIG_SIZE,
        height:BIG_SIZE,
    },
    medium:{
        width:MEDIUM_SIZE,
        height:MEDIUM_SIZE,
    },
    small:{
        width:SMALL_SIZE,
        height:SMALL_SIZE,
    },
    icon:{
        fontSize:ICON_SMALL_SIZE,
        color:'white',
        textAlign:'center'
    },
    iconBig:{
        fontSize:ICON_BIG_SIZE,
    },
    iconMedium:{
        fontSize:ICON_MEDIUM_SIZE,
    },
    iconSmall:{
        fontSize:ICON_SMALL_SIZE,
    },
    disabled:{
        opacity:0.4
    }
});
