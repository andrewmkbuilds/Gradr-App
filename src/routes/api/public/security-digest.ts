import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/security-digest', async (request: Request) => {
  const { handler } = await import('@/lib/edge/security-digest.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/security-digest')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
