import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/csp-report', async (request: Request) => {
  const { handler } = await import('@/lib/edge/csp-report.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/csp-report')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
