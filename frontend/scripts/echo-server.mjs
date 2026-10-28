// Dev-only stand-in for the backend: accepts any POST and reports what it got.
// Run with `npm run echo`, then upload to http://localhost:3001/upload
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 3001)

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.method !== 'POST') return res.writeHead(405).end()

  let bytes = 0
  req.on('data', (chunk) => (bytes += chunk.length))
  req.on('end', () => {
    const summary = {
      received: true,
      method: req.method,
      path: req.url,
      contentType: req.headers['content-type'],
      bytes,
    }
    console.log(summary)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(summary, null, 2))
  })
  // Bind to loopback only so the permissive CORS above isn't reachable from the network
}).listen(PORT, '127.0.0.1', () => console.log(`Echo server listening on http://localhost:${PORT}`))
