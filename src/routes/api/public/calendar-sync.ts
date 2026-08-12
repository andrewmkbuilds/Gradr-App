import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/calendar-sync.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/calendar-sync')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
