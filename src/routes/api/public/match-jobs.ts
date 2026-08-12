import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/match-jobs.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/match-jobs')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
