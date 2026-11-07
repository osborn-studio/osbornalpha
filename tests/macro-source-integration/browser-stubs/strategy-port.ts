// Truthy page gate only; never import production wiring or connect to a database.
export const strategyPort = () => Object.freeze({ fixtureOnly: true });
