import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/search-console.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/search-console')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
