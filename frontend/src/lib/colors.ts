export interface SignerColor {
  fg: string
  bg: string
  border: string
}

// Distinct per-signer colours for field placement (one-to-many mode).
const PALETTE: SignerColor[] = [
  { fg: '#14532D', bg: '#ECFDF5', border: '#16A34A' },
  { fg: '#302A77', bg: '#EEEDFF', border: '#6C63FF' },
  { fg: '#1E3A8A', bg: '#EFF6FF', border: '#2563EB' },
  { fg: '#7C2D12', bg: '#FFF7ED', border: '#EA580C' },
  { fg: '#831843', bg: '#FDF2F8', border: '#DB2777' },
  { fg: '#134E4A', bg: '#F0FDFA', border: '#0D9488' },
]

export function signerColor(index: number): SignerColor {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

export const SHARED_COLOR = PALETTE[0]
