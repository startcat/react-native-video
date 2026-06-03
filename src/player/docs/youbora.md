# Youbora / NPAW

> **Cambio importante (PLAYER-171).** La integración **nativa** legacy de
> Youbora/NPAW (SDK NPAW embebido en iOS y Android, prop nativo `youbora`) ha
> sido **eliminada**. Las analíticas de reproducción **local** ahora se gestionan
> mediante el **sistema de plugins de analíticas**, no dentro de este paquete.
>
> La configuración `youbora` + el hook `getYouboraOptions` que se documentan aquí
> **siguen existiendo**, pero su único uso actual es alimentar el path de
> **Chromecast**: el objeto `youbora` se reenvía en el mensaje de carga al
> receiver, que ejecuta su propia instancia de Youbora.

## Analíticas de reproducción local (plugins)

Para analíticas durante la reproducción nativa (iOS/Android) usa el sistema de
plugins externo y pásalos por `features.analyticsConfig`:

```tsx
import { Player } from "react-native-video";
// El plugin de Youbora se instala/configura aparte:
//   @overon/react-native-overon-player-analytics-plugins-youbora-rn

<Player
	features={{
		analyticsConfig: [youboraPlugin /* , otros plugins */],
	}}
	// ... otras props
/>;
```

El player conecta sus eventos (`onPlay`, `onPause`, `onSeek`, `onEnd`, `onError`,
`onProgress`, buffering, QoE/`onPlaybackMetrics`, etc.) al plugin a través de
`PlayerAnalyticsEvents` / `VideoEventsAdapter`. Consulta la guía del sistema de
plugins en `src/player/features/analytics/docs/`.

## Youbora para Chromecast (path conservado)

Cuando el contenido se reproduce en un receiver de Chromecast, el player no usa
el SDK nativo: serializa la configuración `youbora` y la envía en el mensaje de
carga. El receiver instancia Youbora con esos datos. Por eso la configuración
`youbora` y el hook `getYouboraOptions` (formato `'cast'`) siguen vigentes.

### Configuración (`IYoubora`)

| Campo             | Tipo             | Obligatorio | Descripción                                               |
| ----------------- | ---------------- | ----------- | --------------------------------------------------------- |
| `accountCode`     | string           | ✅          | Código de cuenta de Youbora                               |
| `username`        | string           | ❌          | Identificador del usuario para segmentación               |
| `content`         | `YouboraContent` | ❌          | Metadatos del contenido (ver abajo)                       |
| `offline`         | boolean          | ❌          | Reproducción offline (por defecto: false)                 |
| `userObfuscateIp` | boolean          | ❌          | Ofuscar la IP del usuario (por defecto: false)            |

### Contenido (`YouboraContent`)

| Campo               | Tipo                      | Descripción                                | Ejemplo                        |
| ------------------- | ------------------------- | ------------------------------------------ | ------------------------------ |
| `transactionCode`   | string                    | Código único de transacción de la sesión   | `"txn_abc123"`                 |
| `id`                | string                    | Identificador único del contenido          | `"video_12345"`                |
| `type`              | string                    | Tipo de contenido                          | `"video"`, `"audio"`, `"live"` |
| `title`             | string                    | Título del contenido                       | `"Episodio 1"`                 |
| `program`           | string                    | Nombre del programa o serie                | `"Mi Serie"`                   |
| `isLive`            | boolean                   | Contenido en directo                       | `true` / `false`               |
| `playbackType`      | string                    | Tipo de reproducción                       | `"vod"`, `"live"`, `"dvr"`     |
| `tvShow`            | string                    | Nombre del programa de TV                  | `"Game of Thrones"`            |
| `season`            | string                    | Temporada                                  | `"Temporada 1"`                |
| `episodeTitle`      | string                    | Título del episodio                        | `"Winter is Coming"`           |
| `channel`           | string                    | Canal / plataforma                         | `"HBO"`                        |
| `customDimension`   | `YouboraCustomDimensions` | Hasta 10 dimensiones personalizadas (1-10) | Ver tipos                      |
| `saga`              | string                    | Saga o colección                           | `"Star Wars"`                  |
| `subtitles`         | string                    | Subtítulos seleccionados                   | `"Español"`                    |
| `drm`               | string                    | Tecnología DRM                             | `"Widevine"`                   |
| `language`          | string                    | Idioma del contenido                       | `"es"`                         |
| `streamingProtocol` | string                    | Protocolo de streaming                     | `"HLS"`, `"DASH"`              |
| `metadata`          | `YouboraContentMetadata`  | Metadata adicional clave:valor             | `{ director, year, ... }`      |

### Hook `getYouboraOptions`

`getYouboraOptions(data: IYoubora, format?: 'mobile' | 'cast'): IMappedYoubora`
transforma la configuración `youbora` al formato que espera el receiver. En el
path de Chromecast el player lo invoca con `format = 'cast'`, que usa la
notación de punto del SDK web de Youbora:

```javascript
const getYouboraOptions = (data, format) => {
	if (format === "cast") {
		return {
			accountCode: data.accountCode,
			username: data.username,
			"content.id": data.content?.id,
			"content.title": data.content?.title,
			"content.transactionCode": data.content?.transactionCode,
			"content.isLive": data.content?.isLive,
			"content.customDimension.1": "cast",
			// ... resto de campos en notación de punto
		};
	}
	return {};
};
```

Pásalo al Player como `hooks.getYouboraOptions` junto con `playerAnalytics.youbora`.

## Consideraciones de privacidad

- `userObfuscateIp: true` para cumplir GDPR.
- Minimiza datos personales; usa IDs anónimos cuando sea posible y asegura el
  consentimiento del usuario.

## Enlaces útiles

- Sistema de plugins de analíticas: `src/player/features/analytics/docs/`
- [Documentación oficial de Youbora/NPAW](https://youbora.nicepeopleatwork.com/)
