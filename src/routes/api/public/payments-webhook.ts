import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/payments-webhook.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/payments-webhook')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
