import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ResultsPanel } from '../src/components/ResultsPanel'
import type { ValidationError } from '../src/types'

const sampleErrors: ValidationError[] = [
  {
    instancePath: '/name',
    schemaPath: '#/properties/name/type',
    keyword: 'type',
    message: 'Expected string, got number',
  },
  {
    instancePath: '',
    schemaPath: '#/required',
    keyword: 'required',
    message: 'Missing required property: email',
  },
]

describe('ResultsPanel', () => {
  test('renders each error row with keyword, instance path and message', () => {
    render(<ResultsPanel state="invalid" errors={sampleErrors} />)

    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('/name')
    expect(rows[0]).toHaveTextContent('type')
    expect(rows[0]).toHaveTextContent('Expected string, got number')
    expect(rows[1]).toHaveTextContent('(root)')
    expect(rows[1]).toHaveTextContent('required')
    // Header summary reflects the count.
    expect(screen.getByText(/2 errors/i)).toBeInTheDocument()
  })

  test('invokes onErrorClick when an error row is clicked', async () => {
    const onErrorClick = vi.fn()
    const user = userEvent.setup()
    render(
      <ResultsPanel
        state="invalid"
        errors={sampleErrors}
        onErrorClick={onErrorClick}
      />,
    )

    await user.click(screen.getAllByRole('button')[0])
    expect(onErrorClick).toHaveBeenCalledTimes(1)
    expect(onErrorClick).toHaveBeenCalledWith(sampleErrors[0])
  })

  test('renders the validator error message in the error state', () => {
    render(
      <ResultsPanel
        state="error"
        errors={[]}
        errorMessage="schema parse failed"
      />,
    )
    expect(screen.getByRole('heading', { name: /results/i })).toBeInTheDocument()
    expect(screen.getAllByText('Validator error').length).toBeGreaterThan(0)
    expect(screen.getByText('schema parse failed')).toBeInTheDocument()
  })
})
