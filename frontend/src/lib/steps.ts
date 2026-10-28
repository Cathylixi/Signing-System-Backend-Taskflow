import type { Step } from '../types'

export const WORKFLOW_STEPS: { step: Step; label: string; header: string }[] = [
  { step: 'upload', label: 'Upload document', header: 'Upload' },
  { step: 'signers', label: 'Add signers', header: 'Recipients' },
  { step: 'fields', label: 'Place fields', header: 'Fields' },
  { step: 'review', label: 'Review & send', header: 'Review & send' },
]

export function stepIndex(step: Step): number {
  return WORKFLOW_STEPS.findIndex((s) => s.step === step)
}
