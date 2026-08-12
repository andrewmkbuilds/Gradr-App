import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/send-notification', async (request: Request) => {
  const { handler } = await import('@/lib/edge/send-notification.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/send-notification')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
