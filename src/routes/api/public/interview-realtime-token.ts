import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/interview-realtime-token.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/interview-realtime-token')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
