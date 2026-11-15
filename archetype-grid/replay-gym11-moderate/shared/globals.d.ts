// Globals that Node, browsers and workers all provide but the ES library
// typings do not declare. Shared code may use only these and the ES built-ins.
declare function structuredClone<T>(value: T): T;
