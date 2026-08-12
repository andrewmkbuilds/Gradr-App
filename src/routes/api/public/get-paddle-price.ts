import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/get-paddle-price.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/get-paddle-price')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
