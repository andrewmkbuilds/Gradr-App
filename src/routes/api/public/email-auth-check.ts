import { createFileRoute } from '@tanstack/react-router'
import { withMonitoring } from '@/lib/edge/shared/monitor'

const run = withMonitoring('/api/public/email-auth-check', async (request: Request) => {
  const { handler } = await import('@/lib/edge/email-auth-check.server')
  return handler(request)
})

const route = ({ request }: { request: Request }) => run(request)

export const Route = createFileRoute('/api/public/email-auth-check')({
  server: { handlers: { POST: route, OPTIONS: route } },
})
