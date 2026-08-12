import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/seo-monitor.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/seo-monitor')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
