// React 19's act() environment detection needs this flag set explicitly under jest-expo +
// @testing-library/react-native — without it every state update inside a test logs a benign but
// noisy "not configured to support act(...)" console.error even though the test itself passes.
 
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
