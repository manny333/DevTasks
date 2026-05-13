/** Utility to cast Express route params (typed as ParamsDictionary values) to string */
export const p = (param: string | string[]): string =>
  Array.isArray(param) ? param[0] : param;
