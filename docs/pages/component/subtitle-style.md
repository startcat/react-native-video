# Subtitle Style Configuration

The `subtitleStyle` prop allows you to customize the appearance and positioning of subtitles in the video player (Android only).

## Properties

### fontSize

- **Type:** `number`
- **Description:** Font size in SP (Scale-independent Pixels)
- **Example:** `20`

### paddingTop, paddingBottom, paddingLeft, paddingRight

- **Type:** `number`
- **Description:** Padding around the subtitle text in pixels
- **Example:** `10`

### opacity

- **Type:** `number` (0-1)
- **Description:** Opacity of the subtitle view. Set to 0 to hide subtitles.
- **Default:** `1`
- **Example:** `0.8`

### backgroundColor

- **Type:** `string`
- **Description:** Background color of the subtitle container. Accepts hex colors or named colors.
- **Default:** `transparent`
- **Example:** `"#000000"`, `"rgba(0, 0, 0, 0.8)"`, `"black"`

### verticalAlignment

- **Type:** `string`
- **Description:** Vertical position of subtitles on screen
- **Values:** `"top"` | `"middle"` | `"center"` | `"bottom"`
- **Default:** `"bottom"`
- **Example:** `"bottom"`

## Usage Example

```tsx
import Video from "react-native-video";

<Video
	source={{ uri: "https://example.com/video.m3u8" }}
	selectedTextTrack={{
		type: "title",
		value: "English",
	}}
	subtitleStyle={{
		fontSize: 20,
		paddingBottom: 50,
		paddingTop: 10,
		paddingLeft: 20,
		paddingRight: 20,
		opacity: 1,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		verticalAlignment: "bottom",
	}}
/>;
```

## Common Configurations

### Bottom Subtitles with Semi-transparent Background

```tsx
subtitleStyle={{
  fontSize: 18,
  paddingBottom: 40,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  verticalAlignment: 'bottom'
}}
```

### Top Subtitles (for dual subtitles)

```tsx
subtitleStyle={{
  fontSize: 16,
  paddingTop: 60,
  backgroundColor: 'transparent',
  verticalAlignment: 'top'
}}
```

### Centered Subtitles

```tsx
subtitleStyle={{
  fontSize: 20,
  backgroundColor: '#000000',
  verticalAlignment: 'middle',
  opacity: 0.9
}}
```

### Large Subtitles with Custom Spacing

```tsx
subtitleStyle={{
  fontSize: 24,
  paddingBottom: 80,
  paddingLeft: 30,
  paddingRight: 30,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  verticalAlignment: 'bottom'
}}
```

## Platform Support

| Property          | Android | iOS |
| ----------------- | ------- | --- |
| fontSize          | ✅      | ❌  |
| padding\*         | ✅      | ❌  |
| opacity           | ✅      | ❌  |
| backgroundColor   | ✅      | ❌  |
| verticalAlignment | ✅      | ❌  |

**Note:** Subtitle styling is currently only supported on Android. iOS uses system subtitle rendering which cannot be customized.

## Color Formats

The `backgroundColor` property accepts various color formats:

- **Hex:** `"#000000"`, `"#FF0000"`
- **Hex with alpha:** `"#80000000"` (50% transparent black), `"#00000000"` (fully transparent)
- **RGB:** `"rgb(255, 0, 0)"`
- **RGBA:** `"rgba(0, 0, 0, 0.8)"`
- **Named colors:** `"black"`, `"white"`, `"red"`, `"transparent"`, etc.

### Transparent Background

For a fully transparent background (no background color), you can use:

```tsx
backgroundColor: "transparent"; // Recommended
backgroundColor: "#00000000"; // Alternative (hex with 00 alpha)
```

## Tips

1. **Readability:** Use a semi-transparent dark background (`rgba(0, 0, 0, 0.75)`) for better text readability
2. **Bottom Padding:** Add extra `paddingBottom` (40-60px) to prevent subtitles from overlapping with controls
3. **Font Size:** Standard readable size is 16-20sp. Adjust based on typical viewing distance
4. **Vertical Alignment:** Use `"bottom"` for most cases, `"top"` for secondary subtitles (translations), `"middle"` sparingly as it can obscure action
