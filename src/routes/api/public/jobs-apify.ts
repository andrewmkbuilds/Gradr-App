import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/jobs-apify', async (request: Request) => {
  const { handler } = await import('@/lib/edge/jobs-apify.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/jobs-apify')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
