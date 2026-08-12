import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/resolve-discount', async (request: Request) => {
  const { handler } = await import('@/lib/edge/resolve-discount.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/resolve-discount')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
