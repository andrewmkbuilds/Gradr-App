import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/resolve-discount.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/resolve-discount')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
