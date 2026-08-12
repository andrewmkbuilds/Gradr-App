import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/affiliate-public.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/affiliate-public')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
