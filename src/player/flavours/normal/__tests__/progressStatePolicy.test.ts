const mockStartTransition = jest.fn((callback: () => void) => callback());

jest.mock("react", () => ({
	...jest.requireActual("react"),
	startTransition: (callback: () => void) => mockStartTransition(callback),
}));

import { scheduleProgressStateUpdate, updateProgressState } from "../progressStatePolicy";

/**
 * Estado de progreso del flavour normal — EITB-1892.
 *
 * «Maximum update depth exceeded» desde `handleOnProgress` → `setCurrentTime` en iOS, sobre
 * todo con la app en segundo plano. El estado que se toca en cada tick va en transición y
 * `currentTime` no se actualiza con la app no activa.
 */
describe("progressStatePolicy", () => {
	beforeEach(() => {
		mockStartTransition.mockClear();
	});

	it("con la app activa, actualiza en una transición", () => {
		const update = jest.fn();

		expect(updateProgressState("active", update)).toBe(true);

		expect(mockStartTransition).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledTimes(1);
	});

	it.each(["background", "inactive", "unknown", "extension", null, undefined])(
		"con la app en %p, no actualiza",
		appState => {
			const update = jest.fn();

			expect(updateProgressState(appState, update)).toBe(false);

			expect(mockStartTransition).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
		}
	);

	it("scheduleProgressStateUpdate actualiza siempre, en una transición", () => {
		const update = jest.fn();

		scheduleProgressStateUpdate(update);

		expect(mockStartTransition).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledTimes(1);
	});
});
