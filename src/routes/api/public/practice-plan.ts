import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/practice-plan', async (request: Request) => {
  const { handler } = await import('@/lib/edge/practice-plan.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/practice-plan')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
