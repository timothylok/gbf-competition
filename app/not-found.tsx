import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="card text-center">
      <h1 className="mb-2 text-xl font-bold text-ink">404</h1>
      <Link href="/" className="btn-primary">GBF Competition</Link>
    </div>
  )
}
