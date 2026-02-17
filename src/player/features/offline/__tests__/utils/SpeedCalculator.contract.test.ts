import { SpeedCalculator } from "../../utils/SpeedCalculator";

describe("SpeedCalculator — Contrato público", () => {
	let calculator: SpeedCalculator;

	beforeEach(() => {
		jest.useFakeTimers();
		calculator = new SpeedCalculator(10000, 20);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// --- getSpeed ---

	describe("getSpeed", () => {
		it("#1 sin muestras → 0", () => {
			expect(calculator.getSpeed("d1")).toBe(0);
		});

		it("#2 una muestra → 0", () => {
			calculator.addSample("d1", 1000);

			expect(calculator.getSpeed("d1")).toBe(0);
		});

		it("#3 múltiples muestras → velocidad > 0", () => {
			jest.setSystemTime(new Date(1000));
			calculator.addSample("d1", 0);

			jest.setSystemTime(new Date(2000));
			calculator.addSample("d1", 5000);

			const speed = calculator.getSpeed("d1");
			expect(speed).toBe(5000); // 5000 bytes / 1 second
		});
	});

	// --- getEstimatedTimeRemaining ---

	describe("getEstimatedTimeRemaining", () => {
		it("#4 con velocidad → tiempo > 0", () => {
			jest.setSystemTime(new Date(1000));
			calculator.addSample("d1", 0);

			jest.setSystemTime(new Date(2000));
			calculator.addSample("d1", 1000);

			const remaining = calculator.getEstimatedTimeRemaining("d1", 10000, 5000);
			expect(remaining).toBeGreaterThan(0);
		});

		it("#5 sin velocidad → -1", () => {
			const remaining = calculator.getEstimatedTimeRemaining("d1", 10000, 5000);

			expect(remaining).toBe(-1);
		});

		it("#6 descarga completa → 0", () => {
			jest.setSystemTime(new Date(1000));
			calculator.addSample("d1", 0);

			jest.setSystemTime(new Date(2000));
			calculator.addSample("d1", 10000);

			const remaining = calculator.getEstimatedTimeRemaining("d1", 10000, 10000);
			expect(remaining).toBe(0);
		});
	});

	// --- clear ---

	describe("clear", () => {
		it("#7 limpia un download", () => {
			jest.setSystemTime(new Date(1000));
			calculator.addSample("d1", 0);
			jest.setSystemTime(new Date(2000));
			calculator.addSample("d1", 1000);

			calculator.clear("d1");

			expect(calculator.getSpeed("d1")).toBe(0);
			expect(calculator.getSampleCount("d1")).toBe(0);
		});

		it("#8 no afecta otros downloads", () => {
			jest.setSystemTime(new Date(1000));
			calculator.addSample("d1", 0);
			calculator.addSample("d2", 0);

			jest.setSystemTime(new Date(2000));
			calculator.addSample("d1", 1000);
			calculator.addSample("d2", 2000);

			calculator.clear("d1");

			expect(calculator.getSpeed("d1")).toBe(0);
			expect(calculator.getSpeed("d2")).toBeGreaterThan(0);
		});
	});

	// --- clearAll ---

	describe("clearAll", () => {
		it("#9 limpia todo", () => {
			jest.setSystemTime(new Date(1000));
			calculator.addSample("d1", 0);
			calculator.addSample("d2", 0);

			calculator.clearAll();

			expect(calculator.getSampleCount("d1")).toBe(0);
			expect(calculator.getSampleCount("d2")).toBe(0);
		});
	});

	// --- getSampleCount ---

	describe("getSampleCount", () => {
		it("#10 retorna count correcto", () => {
			expect(calculator.getSampleCount("d1")).toBe(0);

			calculator.addSample("d1", 100);
			expect(calculator.getSampleCount("d1")).toBe(1);

			calculator.addSample("d1", 200);
			expect(calculator.getSampleCount("d1")).toBe(2);
		});
	});
});
