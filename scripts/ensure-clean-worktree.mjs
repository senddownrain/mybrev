import { execFileSync } from 'node:child_process'

try {
  const status = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  if (status.trim()) {
    console.error(
      'Release cancelled: commit or discard all local changes before pushing and deploying.',
    )
    process.exit(1)
  }
} catch (error) {
  if (error.status) {
    process.exit(error.status)
  }

  throw error
}
