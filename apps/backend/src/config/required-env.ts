export function isProductionEnv(_env: NodeJS.ProcessEnv = process.env): boolean {
  throw new Error('not implemented');
}

export function requireInProduction(
  _env: NodeJS.ProcessEnv,
  _name: string,
  _developmentDefault: string,
): string {
  throw new Error('not implemented');
}
