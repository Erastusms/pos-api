/**
 * Parses raw page/limit query strings into validated integers with safe defaults.
 *
 * @example
 * const { skip, take, page, limit } = parsePagination(request.query)
 * const users = await prisma.user.findMany({ skip, take })
 */
export function parsePagination(
  query: Record<string, unknown>,
  defaults = { page: 1, limit: 20, maxLimit: 100 },
) {
  const page = Math.max(1, parseInt(String(query['page'] ?? defaults.page), 10) || 1)
  const limit = Math.min(
    defaults.maxLimit,
    Math.max(1, parseInt(String(query['limit'] ?? defaults.limit), 10) || defaults.limit),
  )
  const skip = (page - 1) * limit

  return { page, limit, skip, take: limit }
}
