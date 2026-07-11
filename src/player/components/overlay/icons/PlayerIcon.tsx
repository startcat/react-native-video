import React, { useMemo } from "react";
import { type StyleProp, type TextStyle, StyleSheet } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

/*
 *  PlayerIcon
 *
 *  Iconos propios de los controles por defecto del Player, dibujados con
 *  react-native-svg. Sustituyen al <Icon> de @ui-kitten/components, que exigía
 *  un <IconRegistry> + @ui-kitten/eva-icons montados por la app anfitriona.
 *  Como ni el fork ni las apps montan ese registro, revelar los controles por
 *  defecto crasheaba con "Cannot read property 'name' of undefined"
 *  (iconRegistry.service.js). Al dibujar los SVG aquí eliminamos esa dependencia
 *  implícita: los controles por defecto funcionan out-of-the-box.
 *
 *  Contrato con los estilos existentes: se conserva la API `name`/`style` que ya
 *  usaban los botones. El tamaño se lee de `fontSize` (o width/height) y el color
 *  de `color` (o tintColor), tal y como estaban definidos los estilos de los
 *  controles. Los estilos de layout (position/top/left/opacity...) se propagan al
 *  <Svg>.
 *
 *  Hallazgo migración CaixaForum 2026-07-11; ticket PLAYER pendiente.
 */

type PlayerIconProps = {
	name: string;
	style?: StyleProp<TextStyle>;
};

const DEFAULT_SIZE = 24;
const DEFAULT_COLOR = "white";
const STROKE_WIDTH = 2;

const PlayerIconComponent = ({ name, style }: PlayerIconProps): React.ReactElement | null => {
	const { size, color, flatStyle } = useMemo(() => {
		const flat = (StyleSheet.flatten(style) || {}) as TextStyle & {
			tintColor?: string;
		};

		const resolvedSize =
			(typeof flat.fontSize === "number" && flat.fontSize) ||
			(typeof flat.width === "number" && flat.width) ||
			(typeof flat.height === "number" && flat.height) ||
			DEFAULT_SIZE;

		const resolvedColor = flat.color || flat.tintColor || DEFAULT_COLOR;

		return { size: resolvedSize, color: resolvedColor as string, flatStyle: flat };
	}, [style]);

	const glyph = useMemo(() => {
		const strokeProps = {
			stroke: color,
			strokeWidth: STROKE_WIDTH,
			strokeLinecap: "round" as const,
			strokeLinejoin: "round" as const,
			fill: "none",
		};

		switch (name) {
			case "play-circle-outline":
				return (
					<>
						<Circle cx={12} cy={12} r={9} {...strokeProps} />
						<Path d="M10 8.5 L16 12 L10 15.5 Z" fill={color} />
					</>
				);

			case "pause-circle-outline":
				return (
					<>
						<Circle cx={12} cy={12} r={9} {...strokeProps} />
						<Line
							x1={10}
							y1={8.5}
							x2={10}
							y2={15.5}
							{...strokeProps}
							strokeWidth={2.2}
						/>
						<Line
							x1={14}
							y1={8.5}
							x2={14}
							y2={15.5}
							{...strokeProps}
							strokeWidth={2.2}
						/>
					</>
				);

			case "play-back-outline":
				// Rebobinar: doble triángulo hacia la izquierda.
				return (
					<>
						<Path d="M11 7 L5 12 L11 17 Z" fill={color} />
						<Path d="M19 7 L13 12 L19 17 Z" fill={color} />
					</>
				);

			case "play-forward-outline":
				// Avance rápido: doble triángulo hacia la derecha.
				return (
					<>
						<Path d="M5 7 L11 12 L5 17 Z" fill={color} />
						<Path d="M13 7 L19 12 L13 17 Z" fill={color} />
					</>
				);

			case "play-skip-forward-outline":
				// Siguiente: triángulo + barra.
				return (
					<>
						<Path d="M6 6 L15 12 L6 18 Z" fill={color} />
						<Line
							x1={17.5}
							y1={6}
							x2={17.5}
							y2={18}
							{...strokeProps}
							strokeWidth={2.4}
						/>
					</>
				);

			case "chevron-back-outline":
				return <Polyline points="15 5 8 12 15 19" {...strokeProps} />;

			case "checkmark-outline":
				return <Polyline points="20 6 9 17 4 12" {...strokeProps} />;

			case "refresh-outline":
				// Reintentar / reiniciar: flecha circular (estilo rotate-cw).
				return (
					<>
						<Polyline points="21 5 21 10 16 10" {...strokeProps} />
						<Path d="M19.4 15 A8 8 0 1 1 17.6 6.3 L21 10" {...strokeProps} />
					</>
				);

			case "settings-outline":
				// Ajustes: engranaje.
				return (
					<>
						<Circle cx={12} cy={12} r={3} {...strokeProps} />
						<Path
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
							{...strokeProps}
						/>
					</>
				);

			case "volume-high-outline":
				return (
					<>
						<Polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill={color} />
						<Path
							d="M15.5 8.5 A5 5 0 0 1 15.5 15.5 M18.5 5.5 A9 9 0 0 1 18.5 18.5"
							{...strokeProps}
						/>
					</>
				);

			case "volume-mute-outline":
				return (
					<>
						<Polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" fill={color} />
						<Line x1={16} y1={9} x2={22} y2={15} {...strokeProps} />
						<Line x1={22} y1={9} x2={16} y2={15} {...strokeProps} />
					</>
				);

			case "browser-outline":
				// Botón Picture-in-Picture: marco grande + ventana pequeña.
				return (
					<>
						<Rect x={3} y={4} width={18} height={14} rx={2} {...strokeProps} />
						<Rect x={12} y={11} width={7} height={5} rx={1} fill={color} />
					</>
				);

			case "chatbox-ellipses-outline":
				// Menú (subtítulos/audio): bocadillo con puntos suspensivos.
				return (
					<>
						<Path
							d="M4 5 h16 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 H9 l-4 3 v-3 H4 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 Z"
							{...strokeProps}
						/>
						<Circle cx={8} cy={10.5} r={1} fill={color} />
						<Circle cx={12} cy={10.5} r={1} fill={color} />
						<Circle cx={16} cy={10.5} r={1} fill={color} />
					</>
				);

			default:
				return null;
		}
	}, [name, color]);

	if (!glyph) {
		return null;
	}

	return (
		<Svg width={size} height={size} viewBox="0 0 24 24" style={flatStyle}>
			{glyph}
		</Svg>
	);
};

PlayerIconComponent.displayName = "PlayerIcon";

export const PlayerIcon = React.memo(PlayerIconComponent);

export default PlayerIcon;
