import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/daily-digest.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/daily-digest')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
