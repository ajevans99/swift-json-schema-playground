import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

function getErrorRows() {
  return within(screen.getByRole('list', { name: /validation errors/i })).getAllByRole(
    'button',
  )
}

describe('ResultsPanel', () => {
  test('renders each error row with keyword, instance path and message', () => {
    render(<ResultsPanel state="invalid" errors={sampleErrors} />)

    const rows = getErrorRows()
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

    await user.click(getErrorRows()[0])
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

  describe('Copy and Download buttons', () => {
    let writeText: ReturnType<typeof vi.fn>

    /**
     * Note: `userEvent.setup()` installs its own `navigator.clipboard` stub
     * that silently swallows `writeText` calls. We must call `setup()` first
     * and THEN override the clipboard, otherwise our mock is shadowed.
     */
    function setupUserAndClipboard() {
      const user = userEvent.setup()
      writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })
      return user
    }

    test('Copy and Download are disabled in idle/validating states', () => {
      const { rerender } = render(<ResultsPanel state="idle" errors={[]} />)
      expect(
        screen.getByRole('button', { name: /copy validation result/i }),
      ).toBeDisabled()
      expect(
        screen.getByRole('button', { name: /download validation result/i }),
      ).toBeDisabled()

      rerender(<ResultsPanel state="validating" errors={[]} />)
      expect(
        screen.getByRole('button', { name: /copy validation result/i }),
      ).toBeDisabled()
      expect(
        screen.getByRole('button', { name: /download validation result/i }),
      ).toBeDisabled()
    })

    test('Copy writes the {valid:true, errors:[]} payload to clipboard for valid state', async () => {
      const user = setupUserAndClipboard()
      render(<ResultsPanel state="valid" errors={[]} />)

      await user.click(
        screen.getByRole('button', { name: /copy validation result/i }),
      )

      expect(writeText).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(writeText.mock.calls[0][0])
      expect(payload).toEqual({ valid: true, errors: [] })

      // Visual feedback flips to "Copied!".
      expect(
        await screen.findByRole('button', { name: /copy validation result/i }),
      ).toHaveTextContent(/copied/i)
    })

    test('Copy writes the {valid:false, errors:[...]} payload for invalid state', async () => {
      const user = setupUserAndClipboard()
      render(<ResultsPanel state="invalid" errors={sampleErrors} />)

      await user.click(
        screen.getByRole('button', { name: /copy validation result/i }),
      )

      const payload = JSON.parse(writeText.mock.calls[0][0])
      expect(payload).toEqual({ valid: false, errors: sampleErrors })
    })

    test('Copy includes a runtimeError field in the error state', async () => {
      const user = setupUserAndClipboard()
      render(
        <ResultsPanel
          state="error"
          errors={[]}
          errorMessage="boom: validator init failed"
        />,
      )

      await user.click(
        screen.getByRole('button', { name: /copy validation result/i }),
      )

      const payload = JSON.parse(writeText.mock.calls[0][0])
      expect(payload).toEqual({
        valid: false,
        errors: [],
        runtimeError: 'boom: validator init failed',
      })
    })

    test('Download triggers an anchor click with the JSON blob', async () => {
      const user = userEvent.setup()

      // jsdom doesn't implement createObjectURL — stub it.
      const createSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:fake')
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {})

      try {
        render(<ResultsPanel state="invalid" errors={sampleErrors} />)

        await user.click(
          screen.getByRole('button', { name: /download validation result/i }),
        )

        expect(createSpy).toHaveBeenCalledTimes(1)
        const blob = createSpy.mock.calls[0][0] as Blob
        expect(blob.type).toBe('application/json')
        const text = await blob.text()
        const payload = JSON.parse(text)
        expect(payload).toEqual({ valid: false, errors: sampleErrors })

        expect(clickSpy).toHaveBeenCalledTimes(1)
      } finally {
        createSpy.mockRestore()
        revokeSpy.mockRestore()
        clickSpy.mockRestore()
      }
    })

    test('Copy shows "Copy failed" when clipboard write rejects', async () => {
      const user = setupUserAndClipboard()
      writeText.mockReset()
      writeText.mockRejectedValueOnce(new Error('denied'))
      render(<ResultsPanel state="valid" errors={[]} />)

      await user.click(
        screen.getByRole('button', { name: /copy validation result/i }),
      )

      expect(
        await screen.findByRole('button', { name: /copy validation result/i }),
      ).toHaveTextContent(/copy failed/i)
    })
  })
})
