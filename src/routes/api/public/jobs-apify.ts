import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/jobs-apify.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/jobs-apify')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
