import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/search-jobs.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/search-jobs')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
