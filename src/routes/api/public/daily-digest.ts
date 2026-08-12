import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/daily-digest', async (request: Request) => {
  const { handler } = await import('@/lib/edge/daily-digest.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/daily-digest')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
