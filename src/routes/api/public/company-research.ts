import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/company-research.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/company-research')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
