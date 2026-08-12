import { createFileRoute } from '@tanstack/react-router'

const run = async ({ request }: { request: Request }) => {
  const { handler } = await import('@/lib/edge/analyze-resume.server')
  return handler(request)
}

export const Route = createFileRoute('/api/public/analyze-resume')({
  server: { handlers: { GET: run, POST: run, OPTIONS: run } },
})
