const mockFullScreen = jest.fn();
const mockStickyImmersive = jest.fn();

jest.mock(
	"react-native-system-navigation-bar",
	() => ({
		__esModule: true,
		default: {
			fullScreen: (...args: unknown[]) => mockFullScreen(...args),
			stickyImmersive: (...args: unknown[]) => mockStickyImmersive(...args),
		},
	}),
	{ virtual: true }
);

import { restoreSystemBarsOnExit } from "../systemBarsOnExit";

describe("restoreSystemBarsOnExit", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("por defecto devuelve las barras del sistema, como siempre", () => {
		restoreSystemBarsOnExit(undefined);

		expect(mockFullScreen).toHaveBeenCalledWith(false);
		expect(mockStickyImmersive).not.toHaveBeenCalled();
	});

	it("una app inmersiva vuelve a su modo inmersivo en vez de quedarse con las barras visibles", () => {
		restoreSystemBarsOnExit(true);

		expect(mockStickyImmersive).toHaveBeenCalledTimes(1);
		expect(mockFullScreen).not.toHaveBeenCalled();
	});
});
