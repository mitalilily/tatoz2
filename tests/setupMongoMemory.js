// The current Jest suite is pure unit coverage. Keep the shared setup hook
// available for transaction-backed suites without opening a database for
// tests that do not need one.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
