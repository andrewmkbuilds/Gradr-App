import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/payments-portal', async (request: Request) => {
  const { handler } = await import('@/lib/edge/payments-portal.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/payments-portal')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
