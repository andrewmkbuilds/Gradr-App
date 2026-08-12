import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/delete-account.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/delete-account')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
