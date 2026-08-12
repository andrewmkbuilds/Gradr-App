import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/get-paddle-price', async (request: Request) => {
  const { handler } = await import('@/lib/edge/get-paddle-price.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/get-paddle-price')({
  server: { handlers: { GET: route, POST: route, OPTIONS: route } },
})
