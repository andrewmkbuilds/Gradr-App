import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/security-scans', async (request: Request) => {
  const { handler } = await import('@/lib/edge/security-scans.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/security-scans')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
