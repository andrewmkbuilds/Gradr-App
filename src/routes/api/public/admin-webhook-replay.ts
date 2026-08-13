import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/admin-webhook-replay', async (request: Request) => {
  const { handler } = await import('@/lib/edge/admin-webhook-replay.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/admin-webhook-replay')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
