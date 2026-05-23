export function calculateEarnedPoints(total: number): number {
  // 1 point setiap Rp10.000
  return Math.floor(total / 10000)
}
