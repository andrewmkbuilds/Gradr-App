import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/email-anomaly', async (request: Request) => {
  const { handler } = await import('@/lib/edge/email-anomaly.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/email-anomaly')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
