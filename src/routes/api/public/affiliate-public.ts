import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/affiliate-public', async (request: Request) => {
  const { handler } = await import('@/lib/edge/affiliate-public.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/affiliate-public')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
