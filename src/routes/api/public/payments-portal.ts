import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/payments-portal.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/payments-portal')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
