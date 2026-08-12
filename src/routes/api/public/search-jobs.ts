import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/search-jobs', async (request: Request) => {
  const { handler } = await import('@/lib/edge/search-jobs.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/search-jobs')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
