import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/interview-coach.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/interview-coach')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
