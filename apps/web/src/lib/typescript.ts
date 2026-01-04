export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1)) * (max - min)) + min;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
