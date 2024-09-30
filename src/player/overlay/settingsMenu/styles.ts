import { StyleSheet } from 'react-native';
import { COLOR, SPACING } from '../../theme';

export const styles = StyleSheet.create({
    container:{
        position:'absolute',
        top:0,
        right:0,
        bottom:0,
        left:0,
    },
    fill:{
        flex:1,
        backgroundColor:COLOR.backgrounds.overViewDark
    },
    upperContents:{
        flex:1,
        alignSelf:'stretch',
        flexDirection:'row',
        padding:SPACING['0.5x'],
    },
    bottomContents:{
        maxWidth:400,
        flexDirection:'row',
        flexWrap:'nowrap',
        justifyContent:'space-between',
        alignSelf:'center',
        paddingVertical:SPACING['0.5x'],
    },
    mainButton:{
        paddingVertical:5,
        flexWrap:'nowrap',
        flex:1,
        marginHorizontal:SPACING['0.5x']
    },
    listsDivider:{
        alignSelf:'stretch',
        width:4,
        borderRadius:2,
        borderWidth:0,
        marginHorizontal:SPACING['0.5x'],
        marginVertical:SPACING['1x'],
        backgroundColor:COLOR.dividers.overDark
    },
    list:{
        flex:1,
        alignSelf:'stretch',
        width:'50%',
        paddingTop:0,
        marginTop:SPACING['1x'],
        marginBottom:SPACING['0.25x']
    },
    title:{
        color:'white',
        marginBottom:SPACING['0.5x'],
        paddingTop:4,
        paddingHorizontal:SPACING['0.75x'],
        backgroundColor:'black',
        borderRadius:5
    },
    menuItem:{
        flexDirection:'row',
        paddingVertical:SPACING['0.5x']
    },
    menuItemIcon:{
        fontSize:24,
        color:'white',
        position:'absolute',
        top:0,
        left:SPACING['0.25x'],
    },
    menuItemTitle:{
        color:'white',
        paddingLeft:SPACING['0.5x'],
        fontSize:20,
        marginLeft:SPACING['1.5x']
    }
});
