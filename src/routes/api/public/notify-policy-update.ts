import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/notify-policy-update.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/notify-policy-update')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
