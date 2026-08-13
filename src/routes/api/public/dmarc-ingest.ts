import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/dmarc-ingest', async (request: Request) => {
  const { handler } = await import('@/lib/edge/dmarc-ingest.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/dmarc-ingest')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
