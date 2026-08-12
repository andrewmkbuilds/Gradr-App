import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/admin-rpc', async (request: Request) => {
  const { handler } = await import('@/lib/edge/admin-rpc.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/admin-rpc')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
