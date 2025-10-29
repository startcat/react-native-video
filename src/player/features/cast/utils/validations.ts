// Detector de cambios reales vs. falsos positivos
export function validateHookStateChange(hookName: string, oldState: any, newState: any): boolean {
	const hasRealChange = JSON.stringify(oldState) !== JSON.stringify(newState);
	// const timestamp = Date.now();

	if (!hasRealChange) {
		//console.warn(`[Hook Validator] ${hookName} - FALSE POSITIVE UPDATE at ${timestamp}`);
		return false;
	}

	// console.log(`[Hook Validator] ${hookName} - REAL CHANGE detected at ${timestamp}`);
	return true;
}
