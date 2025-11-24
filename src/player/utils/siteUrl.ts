/*
 *  Site URL
 *  Obtenemos las rutas con el dominio de la aplicación
 *
 */

import Config from "react-native-config";

// Check Absolute or relative URI
export const getAbsoluteUri = (uri: string): string => {
	if (uri && typeof uri === "string" && uri?.match(/https?:\/\//gi)) {
		// If it's already an absolute URL, normalize double slashes after protocol
		return uri.replace(/([^:]\/)\/+/g, "$1");
	} else if (uri && typeof uri === "string") {
		// Normalize: remove trailing slash from SITE_URL and leading slash from uri
		const BASE_URL = Config.SITE_URL;
		const normalizedBase =
			BASE_URL && BASE_URL[BASE_URL.length - 1] === "/" ? BASE_URL.slice(0, -1) : BASE_URL;
		const normalizedUri = uri[0] === "/" ? uri : "/" + uri;
		return normalizedBase + normalizedUri;
	} else {
		return uri;
	}
};
