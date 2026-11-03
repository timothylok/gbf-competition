import bcrypt from 'bcryptjs'

const pw = process.argv[2]
if (!pw || pw.length < 8) {
  console.error('Usage: npm run hash-password -- "your shared password"  (min 8 characters)')
  process.exit(1)
}
// Base64 avoids "$" characters in the bcrypt hash being treated as variable references in .env files.
const hash = bcrypt.hashSync(pw, 12)
console.log('ADMIN_PASSWORD_HASH_B64=' + Buffer.from(hash).toString('base64'))
