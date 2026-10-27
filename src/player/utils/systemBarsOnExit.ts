import SystemNavigationBar from "react-native-system-navigation-bar";

/**
 * Barras del sistema de Android al desmontar el Player.
 *
 * Al montar, el Player las oculta (`fullScreen(true)`). Al salir las devolvía siempre visibles, y
 * una app que vive en modo inmersivo se quedaba con la barra de navegación a la vista: su layout le
 * reservaba el hueco y la tab bar subía hasta reiniciar (CXF-1460). Como el Player se desmonta
 * después que la pantalla que lo contiene, la app no puede corregirlo por su cuenta: la última
 * palabra es de esta función.
 *
 * @param immersiveOnExit `true` para volver al modo inmersivo (`stickyImmersive`); por defecto, el
 *   comportamiento de siempre.
 */
export const restoreSystemBarsOnExit = (immersiveOnExit?: boolean) => {
	if (immersiveOnExit) {
		SystemNavigationBar.stickyImmersive();
		return;
	}
	SystemNavigationBar.fullScreen(false);
};
