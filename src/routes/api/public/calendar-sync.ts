import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/calendar-sync', async (request: Request) => {
  const { handler } = await import('@/lib/edge/calendar-sync.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/calendar-sync')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
